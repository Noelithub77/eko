import type { StreamProfilerSample } from "../bindings/tauri";

export type Distribution = { count: number; averageMs: number | null; p95Ms: number | null; maxMs: number | null };
export function distribution(values: number[]): Distribution {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  return {
    count: sorted.length,
    averageMs: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
    maxMs: sorted[sorted.length - 1] ?? null,
  };
}

export function summarizeDevice(samples: StreamProfilerSample[], deviceId: string, roomId: string, now = Date.now()) {
  const recent = samples.filter((sample) => sample.deviceId === deviceId && sample.roomId === roomId && sample.createdAtMs !== null && now - sample.createdAtMs >= -1000 && now - sample.createdAtMs <= 30_000);
  const latest = recent[recent.length - 1];
  const current = latest && latest.createdAtMs !== null && now - latest.createdAtMs <= 8000
    ? recent.filter((sample) => sample.connectionId === latest.connectionId) : [];
  return {
    samples: current.length,
    delay: distribution(current.flatMap((sample) => sample.version >= 2 && sample.latencyMs !== null ? [sample.latencyMs] : [])),
    buffer: distribution(current.flatMap((sample) => sample.bufferMs === null ? [] : [sample.bufferMs])),
    roundTrip: distribution(current.flatMap((sample) => sample.roundTripMs == null ? [] : [sample.roundTripMs])),
    jitter: distribution(current.flatMap((sample) => sample.jitterMs === null ? [] : [sample.jitterMs])),
    packetLossPercent: distribution(current.flatMap((sample) => sample.packetLossPercent === null ? [] : [sample.packetLossPercent])).averageMs,
  };
}
