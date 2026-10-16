import type { PairingLinkPayload } from "@shared/types/pairing-link";
import type { StreamProfilerSample } from "@shared/bindings/tauri";
import type { ConnectionQuality } from "./connection-quality";

type LiveProfilerContext = {
  connectionId: string;
  deviceId: string;
  payload: PairingLinkPayload;
  source: "web";
  sendSample: (sample: StreamProfilerSample) => void;
};

export type LiveProfiler = {
  writeQuality: (quality: ConnectionQuality) => void;
};

export function createLiveProfiler(context: LiveProfilerContext): LiveProfiler {
  let sampleIndex = 0;

  return {
    writeQuality: (quality) => {
      sampleIndex += 1;

      context.sendSample({
          version: 2,
          source: context.source,
          kind: "qualitySample",
          createdAtMs: Date.now(),
          connectionId: context.connectionId,
          deviceId: context.deviceId,
          roomId:
            context.payload.hosted?.roomId ?? "local-session",
          sampleIndex,
          latencyMs: quality.latencyMs,
          roundTripMs: quality.roundTripMs,
          jitterMs: quality.jitterMs,
          bufferMs: quality.bufferMs,
          packetLossPercent: quality.packetLossPercent,
          packetsReceived: quality.packetsReceived,
          packetsLost: quality.packetsLost,
      });
    },
  };
}
