import { DurableObject } from "cloudflare:workers";
import {
  relayClientMessageSchema,
  type RelayClientMessage,
  type RelayServerMessage,
} from "./protocol";

const HOST_RECONNECT_GRACE_MS = 60_000;
const MAX_RECEIVERS = 10;
const MAX_MESSAGE_BYTES = 64 * 1024;

type RoomRecord = {
  roomId: string;
  hostTokenHash: string;
  joinTokenHash: string;
};

type ConnectionInfo = {
  role: "pending" | "host" | "receiver";
  clientIp: string;
  deviceId?: string;
};

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async initialize(roomId: string, hostTokenHash: string, joinTokenHash: string): Promise<void> {
    const existing = await this.ctx.storage.get<RoomRecord>("room");
    if (existing) {
      throw new Error("Room already exists");
    }

    await this.ctx.storage.put("room", {
      roomId,
      hostTokenHash,
      joinTokenHash,
    } satisfies RoomRecord);
    await this.ctx.storage.setAlarm(Date.now() + HOST_RECONNECT_GRACE_MS);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (!(await this.ctx.storage.get<RoomRecord>("room"))) {
      return new Response("Room not found", { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({
      role: "pending",
      clientIp: request.headers.get("x-eko-client-ip") ?? "unknown",
    } satisfies ConnectionInfo);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }

    const connection = this.connection(socket);
    const rate = await this.env.SOCKET_MESSAGE_LIMIT.limit({
      key: `${this.ctx.id}:${connection.deviceId ?? connection.clientIp}`,
    });
    if (!rate.success) {
      socket.close(1013, "Message rate exceeded");
      return;
    }

    const message = parseMessage(raw);
    if (!message) {
      socket.close(1008, "Invalid message");
      return;
    }

    if (connection.role === "pending") {
      await this.authenticate(socket, connection, message);
      return;
    }

    await this.route(socket, connection, message);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const connection = this.connection(socket);
    if (connection.role === "host") {
      await this.ctx.storage.setAlarm(Date.now() + HOST_RECONNECT_GRACE_MS);
      this.broadcast({ type: "hostReconnecting" }, socket);
    } else if (connection.role === "receiver" && connection.deviceId) {
      this.sendToHost({ type: "peerLeft", deviceId: connection.deviceId });
    }
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(1011, "WebSocket error");
  }

  async alarm(): Promise<void> {
    await this.closeRoom("Host did not reconnect");
  }

  private async authenticate(
    socket: WebSocket,
    connection: ConnectionInfo,
    message: RelayClientMessage,
  ): Promise<void> {
    const room = await this.ctx.storage.get<RoomRecord>("room");
    if (!room || message.type !== "hello") {
      socket.close(1008, "Authentication required");
      return;
    }

    if (message.role === "host") {
      if (!(await sameSecret(message.token, room.hostTokenHash))) {
        socket.close(1008, "Invalid host token");
        return;
      }
      for (const existing of this.ctx.getWebSockets()) {
        if (existing !== socket && this.connection(existing).role === "host") {
          existing.close(1000, "Host connected elsewhere");
        }
      }
      socket.serializeAttachment({ ...connection, role: "host" } satisfies ConnectionInfo);
      await this.ctx.storage.deleteAlarm();
      this.send(socket, { type: "ready", role: "host" });
      this.broadcast({ type: "hostConnected" }, socket);
      return;
    }

    const joinRate = await this.env.ROOM_JOIN_LIMIT.limit({
      key: `${room.roomId}:${connection.clientIp}`,
    });
    if (!joinRate.success || !(await sameSecret(message.token, room.joinTokenHash))) {
      socket.close(1008, "Invalid receiver token");
      return;
    }
    const receivers = this.ctx
      .getWebSockets()
      .filter((candidate) => this.connection(candidate).role === "receiver");
    if (receivers.length >= MAX_RECEIVERS) {
      socket.close(1013, "Room is full");
      return;
    }
    for (const existing of receivers) {
      if (this.connection(existing).deviceId === message.deviceId) {
        existing.close(1000, "Receiver reconnected");
      }
    }
    socket.serializeAttachment({
      ...connection,
      role: "receiver",
      deviceId: message.deviceId,
    } satisfies ConnectionInfo);
    this.send(socket, { type: "ready", role: "receiver" });
  }

  private async route(
    socket: WebSocket,
    connection: ConnectionInfo,
    message: RelayClientMessage,
  ): Promise<void> {
    if (connection.role === "host") {
      if (message.type === "closeRoom") {
        await this.closeRoom("Desktop stopped streaming");
        return;
      }
      if (message.type !== "signal" || !("deviceId" in message)) {
        socket.close(1008, "Host signal required");
        return;
      }
      this.sendToReceiver(message.deviceId, {
        type: "signal",
        deviceId: message.deviceId,
        payload: message.payload,
      });
      return;
    }

    if (message.type !== "signal" || "deviceId" in message || !connection.deviceId) {
      socket.close(1008, "Receiver signal required");
      return;
    }
    this.sendToHost({ type: "signal", deviceId: connection.deviceId, payload: message.payload });
  }

  private async closeRoom(reason: string): Promise<void> {
    this.broadcast({ type: "roomClosed" });
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(1001, reason);
    }
    await this.ctx.storage.deleteAll();
  }

  private connection(socket: WebSocket): ConnectionInfo {
    const value: unknown = socket.deserializeAttachment();
    if (isConnectionInfo(value)) {
      return value;
    }
    return { role: "pending", clientIp: "unknown" };
  }

  private send(socket: WebSocket, message: RelayServerMessage): void {
    socket.send(JSON.stringify(message));
  }

  private broadcast(message: RelayServerMessage, excluded?: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== excluded && this.connection(socket).role !== "pending") {
        this.send(socket, message);
      }
    }
  }

  private sendToHost(message: RelayServerMessage): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (this.connection(socket).role === "host") {
        this.send(socket, message);
      }
    }
  }

  private sendToReceiver(deviceId: string, message: RelayServerMessage): void {
    for (const socket of this.ctx.getWebSockets()) {
      const connection = this.connection(socket);
      if (connection.role === "receiver" && connection.deviceId === deviceId) {
        this.send(socket, message);
      }
    }
  }
}

function parseMessage(raw: string): RelayClientMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    const result = relayClientMessageSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function isConnectionInfo(value: unknown): value is ConnectionInfo {
  if (typeof value !== "object" || value === null || !("role" in value) || !("clientIp" in value)) {
    return false;
  }
  const info = value as { role: unknown; clientIp: unknown; deviceId?: unknown };
  return (
    (info.role === "pending" || info.role === "host" || info.role === "receiver") &&
    typeof info.clientIp === "string" &&
    (info.deviceId === undefined || typeof info.deviceId === "string")
  );
}

async function sameSecret(secret: string, expectedHash: string): Promise<boolean> {
  const [provided, expected] = await Promise.all([
    hashSecret(secret),
    Promise.resolve(expectedHash),
  ]);
  const encoder = new TextEncoder();
  return crypto.subtle.timingSafeEqual(encoder.encode(provided), encoder.encode(expected));
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
