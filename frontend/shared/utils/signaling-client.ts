import type { JoinRequest } from "../types/device";
import type { SignalClientMessage, SignalServerMessage } from "../types/signaling";
import type { QrPairingPayload } from "../types/stream";

export type SignalClient = {
  close: () => void;
  sendReceiverReady: (deviceId: string) => void;
};

export type SignalClientHandlers = {
  onMessage: (message: SignalServerMessage) => void;
  onError: (message: string) => void;
  onClosed: () => void;
};

export function connectToHost(
  payload: QrPairingPayload,
  request: JoinRequest,
  handlers: SignalClientHandlers,
): SignalClient {
  const socket = new WebSocket(`ws://${payload.host}:${payload.port}`);

  socket.addEventListener("open", () => {
    send(socket, { kind: "joinRequest", request });
  });

  socket.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    if (message) {
      handlers.onMessage(message);
      return;
    }
    handlers.onError("Could not read host message.");
  });

  socket.addEventListener("error", () => handlers.onError("Connection failed."));
  socket.addEventListener("close", handlers.onClosed);

  return {
    close: () => socket.close(),
    sendReceiverReady: (deviceId) => send(socket, { kind: "receiverReady", deviceId }),
  };
}

export function parseQrPayload(text: string): QrPairingPayload | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value)) {
      return null;
    }
    const host = getString(value, "host");
    const port = getNumber(value, "port");
    const roomId = getString(value, "roomId");
    const token = getString(value, "token");

    return host && port && roomId && token ? { host, port, roomId, token } : null;
  } catch {
    return null;
  }
}

function send(socket: WebSocket, message: SignalClientMessage) {
  const json = JSON.stringify(message);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(json);
  }
}

function parseServerMessage(data: unknown): SignalServerMessage | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const value: unknown = JSON.parse(data);
    if (!isObject(value)) {
      return null;
    }
    const kind = getString(value, "kind");
    if (!kind) {
      return null;
    }
    return value as SignalServerMessage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === "string" ? item : null;
}

function getNumber(value: Record<string, unknown>, key: string): number | null {
  const item = value[key];
  return typeof item === "number" ? item : null;
}
