import type { PairingLinkPayload } from "@shared/types/pairing-link";

const PAYLOAD_KEY = "payload";
const CLIENT_PATH = "/client";

export function createPairingLink(payload: PairingLinkPayload): string {
  const encoded = encodePayload(payload);
  return `http://${payload.host}:${payload.port}${CLIENT_PATH}#${PAYLOAD_KEY}=${encoded}`;
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
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const params = new URLSearchParams(hash);
    const encoded = params.get(PAYLOAD_KEY);
    return encoded ? decodePayload(encoded) : null;
  } catch {
    return null;
  }
}

function encodePayload(payload: PairingLinkPayload): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(json);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function decodePayload(encoded: string): PairingLinkPayload | null {
  try {
    const padded = encoded.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const value: unknown = JSON.parse(json);
    return readPayload(value);
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

  const host = value.host;
  const port = value.port;
  const roomId = value.roomId;
  const token = value.token;

  if (
    typeof host !== "string" ||
    typeof port !== "number" ||
    typeof roomId !== "string" ||
    typeof token !== "string"
  ) {
    return null;
  }

  return { host, port, roomId, token };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
