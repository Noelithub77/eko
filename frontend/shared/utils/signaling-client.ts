import type { PairingLinkPayload } from "../types/pairing-link";
import { parsePairingSource } from "./pairing-link";

export function parseQrPayload(text: string): PairingLinkPayload | null {
  return parsePairingSource(text);
}
