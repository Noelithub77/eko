import { z } from "zod";
import type { SignalClientMessage } from "../../frontend/shared/bindings/tauri";

const identity = z.string().trim().min(1).max(128);
const incomingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("joinRequest"), request: z.object({ deviceId: identity,
    deviceName: z.string().trim().min(1).max(40), method: z.enum(["qr", "discovery"]) }) }),
  z.object({ kind: z.literal("receiverReady"), deviceId: identity }),
  z.object({ kind: z.literal("answer"), description: z.object({ deviceId: identity, sdp: z.string().min(1).max(60_000) }) }),
  z.object({ kind: z.literal("iceCandidate"), candidate: z.object({ deviceId: identity, candidate: z.string().max(8_000) }) }),
  z.object({ kind: z.literal("clockSyncRequest"), requestId: z.string().max(128), clientSentAtMs: z.number().finite().nullable() }),
  z.object({ kind: z.literal("updateReceiverName"), deviceId: identity, name: z.string().trim().min(1).max(40) }),
]);

export function parseReceiverSignal(deviceId: string, value: unknown): SignalClientMessage | null {
  const parsed = incomingSchema.safeParse(value);
  if (!parsed.success) return null;
  const message = parsed.data;
  const claimed = "deviceId" in message ? message.deviceId : message.kind === "joinRequest" ? message.request.deviceId
    : message.kind === "answer" ? message.description.deviceId : message.kind === "iceCandidate" ? message.candidate.deviceId : deviceId;
  return claimed === deviceId ? message : null;
}

export const candidateSchema = z.object({ candidate: z.string(), sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(), usernameFragment: z.string().nullable().optional() });
