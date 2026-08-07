import type { PairingLinkPayload } from "@shared/types/pairing-link";

const CLIENT_PATH = "/client";

export function createPairingLink(payload: PairingLinkPayload): string {
  if (payload.hosted) {
    return `${payload.hosted.clientUrl}#payload=${encodePayload(payload)}`;
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
    const encoded = new URLSearchParams(url.hash.slice(1)).get("payload");
    if (encoded) {
      return readPayload(JSON.parse(decodePayload(encoded)));
    }
    return readPayload({ host: url.hostname, port: Number(url.port) });
  } catch {
    return null;
  }
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

function encodePayload(payload: PairingLinkPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
