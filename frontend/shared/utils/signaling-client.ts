import type { QrPairingPayload } from "../types/stream";
import { parsePairingSource } from "./pairing-link";

export function parseQrPayload(text: string): QrPairingPayload | null {
  return parsePairingSource(text);
}
