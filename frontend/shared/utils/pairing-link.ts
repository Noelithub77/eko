import type { PairingLinkPayload } from "@shared/types/pairing-link";

const CLIENT_PATH = "/client";
const PAIRING_VERSION = "1";

export function createPairingLink(payload: PairingLinkPayload): string {
  if (payload.hosted) {
    const hash = new URLSearchParams({
      v: PAIRING_VERSION,
      h: payload.local.host,
      p: String(payload.local.port),
      r: payload.hosted.roomId,
      t: payload.hosted.joinToken,
    });
    return `${payload.hosted.clientUrl}#${hash.toString()}`;
  }
  return `http://${payload.local.host}:${payload.local.port}${CLIENT_PATH}`;
}

export function parsePairingSource(text: string): PairingLinkPayload | null {
  const fromLink = parsePairingLink(text);
  if (fromLink) {
    return fromLink;
  }

  return parseLegacyJsonPayload(text);
}

export function parsePairingLink(text: string): PairingLinkPayload | null {
  try {
    const url = new URL(text);
    const hash = new URLSearchParams(url.hash.slice(1));
    const compact = readCompactPayload(hash, url);
    if (compact) {
      return compact;
    }

    const encoded = hash.get("payload");
    if (encoded) {
      return readPayload(JSON.parse(decodePayload(encoded)));
    }
    return readPayload({ host: url.hostname, port: Number(url.port) });
  } catch {
    return null;
  }
}

function readCompactPayload(params: URLSearchParams, url: URL): PairingLinkPayload | null {
  if (params.get("v") !== PAIRING_VERSION) {
    return null;
  }

  const host = params.get("h");
  const portText = params.get("p");
  const roomId = params.get("r");
  const joinToken = params.get("t");
  const port = portText === null ? Number.NaN : Number(portText);

  if (
    host === null ||
    roomId === null ||
    joinToken === null ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }

  const socketOrigin = url.origin.replace(/^http/, "ws");
  return {
    version: 1,
    local: { host, port },
    hosted: {
      roomId,
      joinToken,
      socketUrl: `${socketOrigin}/v1/rooms/${encodeURIComponent(roomId)}/socket`,
      clientUrl: `${url.origin}${url.pathname}`,
    },
  };
}

function parseLegacyJsonPayload(text: string): PairingLinkPayload | null {
  try {
    const value: unknown = JSON.parse(text);
    return readPayload(value);
  } catch {
    return null;
  }
}

function readPayload(value: unknown): PairingLinkPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.version === 1 && isRecord(value.local)) {
    const host = value.local.host;
    const port = value.local.port;
    const hosted = readHosted(value.hosted);
    if (
      typeof host === "string" &&
      typeof port === "number" &&
      Number.isInteger(port) &&
      (value.hosted === undefined || hosted)
    ) {
      return { version: 1, local: { host, port }, hosted };
    }
    return null;
  }

  const host = value.host;
  const port = value.port;

  if (typeof host !== "string" || typeof port !== "number" || !Number.isInteger(port)) {
    return null;
  }

  return { version: 1, local: { host, port }, hosted: null };
}

function readHosted(value: unknown): PairingLinkPayload["hosted"] | null {
  if (!isRecord(value)) return null;
  const { roomId, joinToken, socketUrl, clientUrl } = value;
  if (
    typeof roomId !== "string" ||
    typeof joinToken !== "string" ||
    typeof socketUrl !== "string" ||
    typeof clientUrl !== "string"
  ) {
    return null;
  }
  try {
    const socket = new URL(socketUrl);
    const client = new URL(clientUrl);
    if (
      !["ws:", "wss:"].includes(socket.protocol) ||
      !["http:", "https:"].includes(client.protocol)
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return { roomId, joinToken, socketUrl, clientUrl };
}

function decodePayload(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
