import type { SignalClientMessage } from "@shared/bindings/tauri";
import type { PairingLinkPayload } from "@shared/types/pairing-link";

const LOCAL_PREFERENCE_WINDOW_MS = 600;
const SIGNALING_READY_TIMEOUT_MS = 5_000;

export type RelayServerMessage =
  | { type: "ready"; role: "host" | "receiver" }
  | { type: "signal"; deviceId: string; payload: unknown }
  | { type: "hostReconnecting" }
  | { type: "hostConnected" }
  | { type: "roomClosed" }
  | { type: "error"; message: string };

export type SignalTransport = {
  socket: WebSocket;
  hosted: boolean;
  send: (message: SignalClientMessage) => void;
};

type AttemptResult =
  | { kind: "success"; transport: SignalTransport }
  | { kind: "failure"; error: string };

export async function createSignalTransport(
  payload: PairingLinkPayload,
  deviceId: string,
): Promise<SignalTransport> {
  const localUrl = `ws://${payload.local.host}:${payload.local.port}/eko`;
  if (!payload.hosted) {
    const transport = await openTransport(localUrl, false, null, deviceId);
    console.info("[eko] selected local signaling transport");
    return transport;
  }

  if (window.location.protocol === "https:") {
    console.info("[eko] skipped local signaling from HTTPS page; using hosted signaling");
    const transport = await openTransport(
      payload.hosted.socketUrl,
      true,
      payload.hosted.joinToken,
      deviceId,
    );
    console.info("[eko] selected hosted signaling transport");
    return transport;
  }

  const localAttempt = settle(openTransport(localUrl, false, null, deviceId));
  const hostedAttempt = settle(
    openTransport(payload.hosted.socketUrl, true, payload.hosted.joinToken, deviceId),
  );
  const first = await Promise.race([
    localAttempt.then((result) => ({ source: "local" as const, result })),
    hostedAttempt.then((result) => ({ source: "hosted" as const, result })),
  ]);

  if (first.result.kind === "success") {
    if (!first.result.transport.hosted) {
      closeWhenReady(hostedAttempt, first.result.transport);
      console.info("[eko] selected local signaling transport");
      return first.result.transport;
    }

    const localPreferred = await withTimeout(localAttempt, LOCAL_PREFERENCE_WINDOW_MS);
    if (localPreferred?.kind === "success" && !localPreferred.transport.hosted) {
      first.result.transport.socket.close();
      console.info("[eko] selected local signaling transport");
      return localPreferred.transport;
    }

    closeWhenReady(localAttempt, first.result.transport);
    console.info("[eko] selected hosted signaling transport after local preference window");
    return first.result.transport;
  }

  const other = first.source === "local" ? hostedAttempt : localAttempt;
  const fallback = await other;
  if (fallback.kind === "success") {
    console.info(
      fallback.transport.hosted
        ? "[eko] selected hosted signaling transport after local signaling failed"
        : "[eko] selected local signaling transport after hosted signaling failed",
    );
    return fallback.transport;
  }

  throw new Error(
    first.source === "local"
      ? `Local signaling failed: ${first.result.error}. Hosted signaling failed: ${fallback.error}`
      : `Hosted signaling failed: ${first.result.error}. Local signaling failed: ${fallback.error}`,
  );
}

function openTransport(
  url: string,
  hosted: boolean,
  joinToken: string | null,
  deviceId: string,
): Promise<SignalTransport> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (error: unknown) {
      reject(new Error(`Could not open ${hosted ? "hosted" : "local"} signaling: ${formatError(error)}`));
      return;
    }

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      fail(`${hosted ? "Hosted" : "Local"} signaling did not become ready within 5 seconds.`);
    }, SIGNALING_READY_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.close();
      reject(new Error(message));
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(makeTransport(socket, hosted));
    };
    const handleOpen = () => {
      if (!hosted) {
        succeed();
        return;
      }
      try {
        socket.send(
          JSON.stringify({
            type: "hello",
            role: "receiver",
            token: joinToken,
            deviceId,
          }),
        );
      } catch (error: unknown) {
        fail(`Could not authenticate hosted signaling: ${formatError(error)}`);
      }
    };
    const handleMessage = (event: MessageEvent<string>) => {
      if (!hosted) return;
      const relay = parseRelayMessage(event.data);
      if (relay?.type === "ready" && relay.role === "receiver") {
        succeed();
      } else if (relay?.type === "error") {
        fail(`Hosted signaling rejected the receiver: ${relay.message}`);
      }
    };
    const handleError = () => {
      fail(`Could not reach ${hosted ? "hosted" : "local"} signaling.`);
    };
    const handleClose = () => {
      fail(`${hosted ? "Hosted" : "Local"} signaling closed before it was ready.`);
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);
  });
}

function makeTransport(socket: WebSocket, hosted: boolean): SignalTransport {
  return {
    socket,
    hosted,
    send: (message) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(hosted ? { type: "signal", payload: message } : message));
    },
  };
}

async function settle(attempt: Promise<SignalTransport>): Promise<AttemptResult> {
  try {
    return { kind: "success", transport: await attempt };
  } catch (error: unknown) {
    return { kind: "failure", error: formatError(error) };
  }
}

function withTimeout(
  attempt: Promise<AttemptResult>,
  timeoutMs: number,
): Promise<AttemptResult | null> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
    void attempt.then((result) => {
      window.clearTimeout(timeoutId);
      resolve(result);
    });
  });
}

function closeWhenReady(attempt: Promise<AttemptResult>, selected: SignalTransport): void {
  void attempt.then((result) => {
    if (result.kind === "success" && result.transport !== selected) {
      result.transport.socket.close();
    }
  });
}

export function parseRelayMessage(text: string): RelayServerMessage | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || !("type" in value)) return null;
    const message = value as Record<string, unknown>;
    if (message.type === "signal" && typeof message.deviceId === "string") {
      return { type: "signal", deviceId: message.deviceId, payload: message.payload };
    }
    if (message.type === "ready" && (message.role === "host" || message.role === "receiver")) {
      return { type: "ready", role: message.role };
    }
    if (
      message.type === "hostReconnecting" ||
      message.type === "hostConnected" ||
      message.type === "roomClosed"
    ) {
      return { type: message.type };
    }
    if (message.type === "error" && typeof message.message === "string") {
      return { type: "error", message: message.message };
    }
    return null;
  } catch {
    return null;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error.";
}
