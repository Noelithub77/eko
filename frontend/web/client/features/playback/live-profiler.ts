import type { PairingLinkPayload } from "@shared/types/pairing-link";
import type { ConnectionQuality } from "./connection-quality";

type LiveProfilerContext = {
  connectionId: string;
  deviceId: string;
  payload: PairingLinkPayload;
  source: "web";
};

export type LiveProfiler = {
  writeQuality: (quality: ConnectionQuality) => void;
};

export function createLiveProfiler(context: LiveProfilerContext): LiveProfiler {
  let sampleIndex = 0;

  return {
    writeQuality: (quality) => {
      sampleIndex += 1;

      void fetch("/__eko_profiler", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 1,
          source: context.source,
          kind: "qualitySample",
          createdAtMs: Date.now(),
          connectionId: context.connectionId,
          deviceId: context.deviceId,
          roomId: context.payload.roomId,
          sampleIndex,
          latencyMs: quality.latencyMs,
          jitterMs: quality.jitterMs,
          bufferMs: quality.bufferMs,
          packetLossPercent: quality.packetLossPercent,
          packetsReceived: quality.packetsReceived,
          packetsLost: quality.packetsLost,
        }),
        keepalive: true,
      }).catch(() => undefined);
    },
  };
}
