import type { SignalServerMessage } from "../../frontend/shared/bindings/tauri";
import { candidateSchema } from "./signals";
import type { HostSession } from "./session";

type PeerRecord = { peer: RTCPeerConnection; local: RTCIceCandidateInit[]; remote: RTCIceCandidateInit[]; offered: boolean;
  cancelled: Promise<undefined>; cancel: () => void };
export class HostPeers {
  private records = new Map<string, PeerRecord>();
  constructor(private readonly session: HostSession, private readonly stream: MediaStream,
    private readonly servers: () => RTCIceServer[], private readonly send: (deviceId: string, message: SignalServerMessage) => void,
    private readonly changed: () => void) {}

  async ready(deviceId: string): Promise<void> {
    if (!this.session.approved(deviceId) || this.records.has(deviceId)) return;
    const track = this.stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("Tab audio is no longer available.");
    const peer = new RTCPeerConnection({ iceServers: this.servers(), iceTransportPolicy: "all" });
    let cancel = () => {};
    const cancelled = new Promise<undefined>((resolve) => { cancel = () => resolve(undefined); });
    const record: PeerRecord = { peer, local: [], remote: [], offered: false, cancelled, cancel };
    this.records.set(deviceId, record);
    const transceiver = peer.addTransceiver(track, { direction: "sendonly", streams: [this.stream] });
    const opus = RTCRtpSender.getCapabilities("audio")?.codecs.filter((codec) => codec.mimeType.toLowerCase() === "audio/opus");
    if (opus?.length) transceiver.setCodecPreferences(opus);
    peer.onicecandidate = ({ candidate }) => {
      if (!candidate || !this.valid(deviceId, record)) return;
      if (record.offered) this.sendCandidate(deviceId, candidate.toJSON());
      else record.local.push(candidate.toJSON());
    };
    peer.onconnectionstatechange = () => {
      if (!this.valid(deviceId, record)) return;
      if (peer.connectionState === "connected") {
        this.session.connected(deviceId);
        this.send(deviceId, { kind: "permissionChanged", deviceId, state: "connected", session: this.session.snapshot() });
        this.send(deviceId, { kind: "audioReady", deviceId });
      } else if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        this.close(deviceId);
        this.session.disconnect(deviceId);
        this.send(deviceId, { kind: "permissionChanged", deviceId, state: "disconnected", session: this.session.snapshot() });
      }
      this.changed();
    };
    try {
      const offer = await Promise.race([peer.createOffer(), record.cancelled]);
      if (!offer || !this.valid(deviceId, record)) return;
      await Promise.race([peer.setLocalDescription(offer), record.cancelled]);
      if (!this.valid(deviceId, record)) return;
      this.send(deviceId, { kind: "hostOffer", description: { deviceId, sdp: offer.sdp ?? "" } });
      record.offered = true;
      for (const candidate of record.local.splice(0)) this.sendCandidate(deviceId, candidate);
    } catch (error) { this.close(deviceId); this.session.disconnect(deviceId); this.changed(); throw error; }
  }
  async answer(deviceId: string, sdp: string): Promise<void> {
    const record = this.records.get(deviceId);
    if (!record || !this.valid(deviceId, record) || record.peer.signalingState !== "have-local-offer") return;
    await Promise.race([record.peer.setRemoteDescription({ type: "answer", sdp }), record.cancelled]);
    if (!this.valid(deviceId, record)) return;
    for (const candidate of record.remote.splice(0)) {
      if (!this.valid(deviceId, record)) return;
      await Promise.race([record.peer.addIceCandidate(candidate), record.cancelled]);
    }
    if (!this.valid(deviceId, record)) return;
    this.send(deviceId, { kind: "playbackSchedule", playAtServerMs: Date.now() + 40, jitterBufferTargetMs: 40 });
  }
  async candidate(deviceId: string, json: string): Promise<void> {
    const record = this.records.get(deviceId);
    if (!record || !this.valid(deviceId, record)) return;
    const value: unknown = JSON.parse(json);
    const candidate = candidateSchema.parse(value);
    if (record.peer.remoteDescription) await Promise.race([record.peer.addIceCandidate(candidate), record.cancelled]);
    else if (record.remote.length < 64) record.remote.push(candidate);
  }
  close(deviceId: string): void {
    const record = this.records.get(deviceId);
    if (!record) return;
    this.records.delete(deviceId);
    record.cancel();
    record.peer.onconnectionstatechange = null;
    record.peer.onicecandidate = null;
    record.peer.close();
  }
  closeAll(): void { for (const deviceId of this.records.keys()) this.close(deviceId); }
  private valid(deviceId: string, record: PeerRecord): boolean {
    return this.session.approved(deviceId) && this.records.get(deviceId) === record;
  }
  private sendCandidate(deviceId: string, candidate: RTCIceCandidateInit): void {
    this.send(deviceId, { kind: "hostIceCandidate", candidate: { deviceId, candidate: JSON.stringify(candidate) } });
  }
}
