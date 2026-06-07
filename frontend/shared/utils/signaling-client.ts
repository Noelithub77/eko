import type { QrPairingPayload } from "../types/stream";

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
