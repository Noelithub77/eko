import { z } from "zod";
import type { Device, QrPairingPayload } from "../../frontend/shared/bindings/tauri";

const deviceSchema = z.object({
  deviceId: z.string(), deviceName: z.string(), label: z.string().nullable(),
  state: z.enum(["pending", "connecting", "connected", "disconnected", "failed", "denied"]),
  joinMethod: z.enum(["qr", "discovery"]), connectedAt: z.string().nullable(),
  webRtcState: z.string(), iceState: z.string(), connectionPath: z.enum(["local", "direct", "relayed"]).nullable(),
});
const pairingSchema = z.object({
  version: z.number(), local: z.object({ host: z.string(), port: z.number() }),
  hosted: z.object({ roomId: z.string(), joinToken: z.string(), socketUrl: z.string(), clientUrl: z.string() }).nullable(),
});
export const snapshotSchema = z.object({
  status: z.enum(["idle", "starting", "streaming", "reconnecting", "error"]),
  tabId: z.number().nullable(), tabTitle: z.string(), pairing: pairingSchema.nullable(),
  devices: z.array(deviceSchema), muteLocal: z.boolean(), error: z.string().nullable(), warning: z.string().nullable(),
});
export type HostSnapshot = Omit<z.infer<typeof snapshotSchema>, "devices" | "pairing"> & {
  devices: Device[]; pairing: QrPairingPayload | null;
};
export const initialSnapshot: HostSnapshot = {
  status: "idle", tabId: null, tabTitle: "", pairing: null, devices: [], muteLocal: false, error: null, warning: null,
};
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("getState") }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("allow"), deviceId: z.string() }),
  z.object({ type: z.literal("deny"), deviceId: z.string() }),
  z.object({ type: z.literal("disconnect"), deviceId: z.string() }),
  z.object({ type: z.literal("unblock"), deviceId: z.string() }),
  z.object({ type: z.literal("mute"), muted: z.boolean() }),
]);
export type HostCommand = z.infer<typeof commandSchema>;
export const replySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), state: snapshotSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export const updateSchema = z.object({ target: z.literal("popup"), state: snapshotSchema });
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The extension could not complete this action.";
}
