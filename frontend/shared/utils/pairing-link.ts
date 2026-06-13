import type { PairingLinkPayload } from "@shared/types/pairing-link";

const CLIENT_PATH = "/client";

export function createPairingLink(payload: PairingLinkPayload): string {
  return `http://${payload.host}:${payload.port}${CLIENT_PATH}`;
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
    return readPayload({
      host: url.hostname,
      port: Number(url.port),
    });
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

  if (typeof host !== "string" || typeof port !== "number" || !Number.isInteger(port)) {
    return null;
  }

  return { host, port };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
