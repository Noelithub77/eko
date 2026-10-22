import type { HostedRoom, RelayServerMessage } from "../../relay/protocol";
import type { SignalServerMessage } from "../../frontend/shared/bindings/tauri";
import { initialSnapshot, errorMessage, type HostCommand, type HostSnapshot } from "./messages";
import { HostSession } from "./session";
import { HostPeers } from "./peers";
import { HostRelay, createHostedRoom, fetchIceServers } from "./relay";
import { parseReceiverSignal } from "./signals";
import { openCapture, type CaptureRequest } from "./capture";

export class AudioHost {
  private state: HostSnapshot = { ...initialSnapshot };
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private gain: GainNode | null = null;
  private relay: HostRelay | null = null;
  private session: HostSession | null = null;
  private peers: HostPeers | null = null;
  private servers: RTCIceServer[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private credentialsTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  constructor(private readonly publish: (snapshot: HostSnapshot) => void) {}

  snapshot(): HostSnapshot { return { ...this.state, devices: this.session?.devices ?? [] }; }
  async start(request: CaptureRequest): Promise<HostSnapshot> {
    if (this.state.status !== "idle" && this.state.status !== "error") throw new Error("A stream is already active.");
    this.state = { ...initialSnapshot, status: "starting" };
    this.changed();
    try {
      const capture = await openCapture(request);
      this.stream = capture.stream;
      this.state.tabId = capture.tabId;
      this.state.tabTitle = capture.title;
      const track = this.stream.getAudioTracks()[0];
      if (!track) throw new Error("The shared source did not provide an audio track.");
      this.audio = new AudioContext();
      this.gain = this.audio.createGain();
      this.audio.createMediaStreamSource(this.stream).connect(this.gain);
      this.gain.connect(this.audio.destination);
      await this.audio.resume();
      const room = await createHostedRoom();
      this.relay = new HostRelay(room, (message) => this.receive(message), () => this.reconnect(), (error) => {
        this.state.warning = errorMessage(error); this.changed();
      });
      this.session = new HostSession(room.roomId, room.joinToken);
      this.state.pairing = { version: 1, local: { host: "localhost", port: 4040 }, hosted: {
        roomId: room.roomId, joinToken: room.joinToken, socketUrl: room.socketUrl, clientUrl: room.clientUrl,
      } };
      this.peers = new HostPeers(this.session, this.stream, () => this.servers,
        (deviceId, message) => this.send(deviceId, message), () => this.changed());
      // Authenticate before fetching TURN, so a subsequent failure can close the room.
      await this.relay.connect();
      await this.refreshCredentials(room);
      if (track.readyState !== "live") throw new Error("Audio capture ended during startup.");
      track.onended = () => { void this.fail(new Error("Audio capture ended.")); };
      this.state.status = "streaming";
      this.changed();
      return this.snapshot();
    } catch (error) { await this.fail(error); throw error; }
  }
  async command(command: HostCommand): Promise<HostSnapshot> {
    if (command.type === "stop") await this.stop();
    else if (command.type === "mute") {
      this.state.muteLocal = command.muted;
      if (this.gain) this.gain.gain.value = command.muted ? 0 : 1;
    } else if (this.session && "deviceId" in command) {
      const { deviceId } = command;
      if (command.type === "allow" && this.session.allow(deviceId)) {
        this.send(deviceId, { kind: "permissionChanged", deviceId, state: "connecting", session: this.session.snapshot() });
        this.send(deviceId, { kind: "webRtcReady", deviceId });
      } else if (command.type === "deny" || command.type === "disconnect") {
        this.peers?.close(deviceId);
        if (command.type === "deny") this.session.deny(deviceId);
        else this.session.disconnect(deviceId);
        this.send(deviceId, { kind: "permissionChanged", deviceId,
          state: command.type === "deny" ? "denied" : "disconnected", session: this.session.snapshot() });
      } else if (command.type === "unblock") this.session.unblock(deviceId);
    }
    this.changed();
    return this.snapshot();
  }
  async stop(): Promise<void> {
    this.state.status = "idle";
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.credentialsTimer) clearTimeout(this.credentialsTimer);
    this.retryTimer = null;
    this.credentialsTimer = null;
    this.attempts = 0;
    this.peers?.closeAll();
    this.peers = null;
    this.relay?.close();
    this.relay = null;
    for (const track of this.stream?.getTracks() ?? []) { track.onended = null; track.stop(); }
    this.stream = null;
    const audio = this.audio;
    this.audio = null;
    this.gain = null;
    this.session = null;
    this.servers = [];
    this.state = { ...initialSnapshot };
    if (audio && audio.state !== "closed") {
      try { await audio.close(); } catch { this.state.warning = "The audio context could not close cleanly."; }
    }
    this.changed();
  }
  private async fail(error: unknown): Promise<void> {
    await this.stop();
    this.state.status = "error";
    this.state.error = errorMessage(error);
    this.changed();
  }
  private async receive(envelope: RelayServerMessage): Promise<void> {
    if (!this.session) return;
    if (envelope.type === "roomClosed") { await this.fail(new Error("The sharing room closed.")); return; }
    if (envelope.type === "peerLeft") {
      this.peers?.close(envelope.deviceId);
      this.session.disconnect(envelope.deviceId);
      this.changed();
      return;
    }
    if (envelope.type !== "signal") return;
    const { deviceId } = envelope;
    const message = parseReceiverSignal(deviceId, envelope.payload);
    if (!message) return;
    if (message.kind === "joinRequest") {
      this.session.request(message.request);
      const state = this.session.devices.find((device) => device.deviceId === deviceId)?.state;
      if (state === "denied") this.send(deviceId, { kind: "joinRejected", reason: "This listener is blocked." });
      else if (state === "pending") this.send(deviceId, { kind: "approvalWaiting", deviceId, session: this.session.snapshot() });
      else if (state === "connecting" || state === "connected") {
        this.send(deviceId, { kind: "permissionChanged", deviceId, state, session: this.session.snapshot() });
      }
      this.changed();
      return;
    }
    if (message.kind === "clockSyncRequest") {
      const now = Date.now();
      this.send(deviceId, { ...message, kind: "clockSyncResponse", serverReceivedAtMs: now, serverSentAtMs: now });
      return;
    }
    if (!this.session.approved(deviceId)) return;
    if (message.kind === "receiverReady") await this.peers?.ready(deviceId);
    else if (message.kind === "answer") await this.peers?.answer(deviceId, message.description.sdp);
    else if (message.kind === "iceCandidate") await this.peers?.candidate(deviceId, message.candidate.candidate);
    else if (message.kind === "updateReceiverName") {
      this.session.devices = this.session.devices.map((device) => device.deviceId === deviceId ? { ...device, deviceName: message.name } : device);
      this.changed();
    }
  }
  private reconnect(): void {
    if (this.retryTimer || this.state.status === "idle" || this.state.status === "error") return;
    if (this.attempts >= 5) { void this.fail(new Error("The relay connection was lost. Start sharing again.")); return; }
    this.state.status = "reconnecting";
    this.changed();
    const relay = this.relay;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!relay || relay !== this.relay) return;
      void relay.connect().then(() => {
        if (relay !== this.relay) return;
        this.attempts = 0;
        this.state.status = "streaming";
        this.changed();
      }).catch(() => this.reconnect());
    }, 500 * 2 ** this.attempts++);
  }
  private async refreshCredentials(room: HostedRoom): Promise<void> {
    const relay = this.relay;
    try {
      const servers = await fetchIceServers(room);
      if (relay !== this.relay) return;
      this.servers = servers;
      this.state.warning = null;
    } catch (error) {
      if (relay !== this.relay) return;
      this.servers = [{ urls: "stun:stun.cloudflare.com:3478" }];
      this.state.warning = errorMessage(error);
    }
    if (relay !== this.relay) return;
    this.credentialsTimer = setTimeout(() => { void this.refreshCredentials(room); }, 45 * 60 * 1000);
    this.changed();
  }
  private send(deviceId: string, message: SignalServerMessage): void { this.relay?.send(deviceId, message); }
  private changed(): void { this.publish(this.snapshot()); }
}
