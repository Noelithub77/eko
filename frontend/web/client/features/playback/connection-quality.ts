import { selectedCandidatePair, statsFields } from "../../../../shared/utils/web-rtc-stats";

import type { ConnectionQuality } from "@shared/types/connection-quality";

type AudioSnapshot = {
  id: unknown;
  received: number | null;
  lost: number | null;
  delay: number | null;
  emitted: number | null;
};

export type ConnectionQualityTracker = { read: () => Promise<ConnectionQuality> };

export function createConnectionQualityTracker(peer: Pick<RTCPeerConnection, "getStats">): ConnectionQualityTracker {
  let previous: AudioSnapshot | null = null;
  return { read: async () => {
    const reports = statsFields(await peer.getStats());
    const pair = selectedCandidatePair(reports);
    const roundTrip = pair ? number(pair, "currentRoundTripTime") : null;
    const roundTripMs = roundTrip === null ? null : roundTrip * 1000;
    const audio = reports.find((item) => item.type === "inbound-rtp" && item.kind === "audio");
    const current = audio ? {
      id: audio.id,
      received: number(audio, "packetsReceived"), lost: number(audio, "packetsLost"),
      delay: number(audio, "jitterBufferDelay"), emitted: number(audio, "jitterBufferEmittedCount"),
    } : null;
    const sameStream = previous?.id === current?.id;
    const bufferMs = current && sameStream && previous
      ? averageDelta(current.delay, previous.delay, current.emitted, previous.emitted)
      : null;
    let packetLossPercent: number | null = null;
    if (sameStream && current?.received !== null && current?.lost !== null && previous?.received !== null && previous?.lost !== null && current && previous) {
      const received = current.received - previous.received;
      const lost = Math.max(0, current.lost - previous.lost);
      if (received >= 0 && received + lost > 0) packetLossPercent = 100 * lost / (received + lost);
    }
    previous = current;
    const jitter = audio ? number(audio, "jitter") : null;
    return {
      latencyMs: roundTripMs !== null && bufferMs !== null ? roundTripMs / 2 + bufferMs : null,
      roundTripMs, bufferMs, jitterMs: jitter === null ? null : jitter * 1000,
      packetLossPercent, packetsReceived: current?.received ?? null, packetsLost: current?.lost ?? null,
    };
  } };
}

function averageDelta(total: number | null, before: number | null, count: number | null, beforeCount: number | null): number | null {
  if (total === null || before === null || count === null || beforeCount === null || count <= beforeCount || total < before) return null;
  return 1000 * (total - before) / (count - beforeCount);
}

function number(fields: Record<string, unknown>, key: string): number | null {
  const value = fields[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
