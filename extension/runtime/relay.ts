import { z } from "zod";
import { hostedRoomSchema, relayServerMessageSchema, type HostedRoom, type RelayServerMessage } from "../../relay/protocol";
import type { SignalServerMessage } from "../../frontend/shared/bindings/tauri";

const origin = "https://eko.allpyq.in";
const iceSchema = z.object({ iceServers: z.array(z.object({
  urls: z.union([z.string(), z.array(z.string())]), username: z.string().optional(), credential: z.string().optional(),
})) });

export async function createHostedRoom(): Promise<HostedRoom> {
  const response = await fetch(`${origin}/v1/rooms`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Could not create a room (${response.status}).`);
  const room = hostedRoomSchema.parse(await response.json());
  if (new URL(room.clientUrl).origin !== origin || new URL(room.socketUrl).origin !== origin.replace("https:", "wss:")) {
    throw new Error("The relay returned an unexpected room address.");
  }
  return room;
}

export async function fetchIceServers(room: HostedRoom): Promise<RTCIceServer[]> {
  const response = await fetch(`${origin}/v1/rooms/${room.roomId}/turn`, {
    headers: { Authorization: `Bearer ${room.hostToken}` }, signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`TURN is unavailable (${response.status}). Direct connections can still work.`);
  return iceSchema.parse(await response.json()).iceServers;
}

export class HostRelay {
  private socket: WebSocket | null = null;
  private queue = Promise.resolve();
  private stopped = false;
  constructor(readonly room: HostedRoom,
    private readonly receive: (message: RelayServerMessage) => Promise<void>,
    private readonly disconnected: () => void,
    private readonly failed: (error: unknown) => void) {}

  connect(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("The stream has stopped."));
    const socket = new WebSocket(this.room.socketUrl);
    this.socket = socket;
    return new Promise((resolve, reject) => {
      let ready = false;
      const timeout = setTimeout(() => { reject(new Error("The relay did not become ready.")); socket.close(); }, 8_000);
      socket.onopen = () => socket.send(JSON.stringify({ type: "hello", role: "host", token: this.room.hostToken }));
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (socket !== this.socket || this.stopped || typeof event.data !== "string") return;
        let value: unknown;
        try { value = JSON.parse(event.data); } catch { return; }
        const parsed = relayServerMessageSchema.safeParse(value);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "ready" && message.role === "host") {
          ready = true;
          clearTimeout(timeout);
          resolve();
        } else if (message.type === "error" && !ready) {
          clearTimeout(timeout);
          reject(new Error(message.message));
          socket.close();
        } else if (ready) {
          this.queue = this.queue.then(() => {
            if (!this.stopped && socket === this.socket) return this.receive(message);
          }).catch(this.failed);
        }
      };
      socket.onerror = () => { if (!ready) { clearTimeout(timeout); reject(new Error("Could not connect to the relay.")); socket.close(); } };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (!ready) reject(new Error("The relay closed before authentication."));
        if (ready && !this.stopped && socket === this.socket) this.disconnected();
      };
    });
  }
  send(deviceId: string, payload: SignalServerMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "signal", deviceId, payload }));
  }
  close(): void {
    this.stopped = true;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "closeRoom" }));
    this.socket?.close();
    this.socket = null;
  }
}
