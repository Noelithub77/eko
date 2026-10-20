import type { StreamProfilerSample } from "../bindings/tauri";

export type ConnectionQuality = Pick<StreamProfilerSample,
  "latencyMs" | "roundTripMs" | "jitterMs" | "bufferMs" |
  "packetLossPercent" | "packetsReceived" | "packetsLost"
>;

export const emptyQuality: ConnectionQuality = {
  latencyMs: null,
  roundTripMs: null,
  jitterMs: null,
  bufferMs: null,
  packetLossPercent: null,
  packetsReceived: null,
  packetsLost: null,
};
