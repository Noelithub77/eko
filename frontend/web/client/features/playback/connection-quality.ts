export type ConnectionQuality = {
  latencyMs: number | null;
  jitterMs: number | null;
  bufferMs: number | null;
  packetLossPercent: number | null;
  packetsReceived: number | null;
  packetsLost: number | null;
};

type PacketSnapshot = {
  packetsReceived: number;
  packetsLost: number;
};

export type ConnectionQualityTracker = {
  read: () => Promise<ConnectionQuality>;
};

export function createConnectionQualityTracker(peer: RTCPeerConnection): ConnectionQualityTracker {
  let lastPackets: PacketSnapshot | null = null;

  return {
    read: async () => {
      const report = await peer.getStats();
      let latencyMs: number | null = null;
      let jitterMs: number | null = null;
      let bufferMs: number | null = null;
      let packetSnapshot: PacketSnapshot | null = null;

      for (const item of report.values()) {
        const fields = toStatsFields(item);

        if (fields.type === "candidate-pair" && fields.state === "succeeded") {
          latencyMs = secondsToMs(readNumber(fields, "currentRoundTripTime"));
        }

        if (fields.type === "inbound-rtp" && fields.kind === "audio") {
          jitterMs = secondsToMs(readNumber(fields, "jitter"));
          bufferMs = readAudioBufferMs(fields);
          packetSnapshot = {
            packetsReceived: readNumber(fields, "packetsReceived") ?? 0,
            packetsLost: readNumber(fields, "packetsLost") ?? 0,
          };
        }
      }

      const packetLossPercent = calculatePacketLossPercent(lastPackets, packetSnapshot);
      lastPackets = packetSnapshot;

      return {
        latencyMs,
        jitterMs,
        bufferMs,
        packetLossPercent,
        packetsReceived: packetSnapshot?.packetsReceived ?? null,
        packetsLost: packetSnapshot?.packetsLost ?? null,
      };
    },
  };
}

function calculatePacketLossPercent(
  previous: PacketSnapshot | null,
  current: PacketSnapshot | null,
): number | null {
  if (!previous || !current) {
    return null;
  }

  const received = current.packetsReceived - previous.packetsReceived;
  const lost = current.packetsLost - previous.packetsLost;
  const total = received + lost;

  if (total <= 0) {
    return 0;
  }

  return (lost / total) * 100;
}

function readAudioBufferMs(fields: Record<string, unknown>): number | null {
  const delay = readNumber(fields, "jitterBufferDelay");
  const emitted = readNumber(fields, "jitterBufferEmittedCount");

  if (delay === null || emitted === null || emitted <= 0) {
    return secondsToMs(readNumber(fields, "jitterBufferTargetDelay"));
  }

  return (delay / emitted) * 1000;
}

function secondsToMs(value: number | null): number | null {
  return value === null ? null : value * 1000;
}

function readNumber(fields: Record<string, unknown>, key: string): number | null {
  const value = fields[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStatsFields(item: RTCStats): Record<string, unknown> {
  return item as unknown as Record<string, unknown>;
}
