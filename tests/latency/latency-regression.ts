import assert from "node:assert/strict";
import { test } from "node:test";
import { createConnectionQualityTracker } from "../../frontend/web/client/features/playback/connection-quality.ts";

function report(delay: number, emitted: number, received: number, lost = 0): RTCStatsReport {
  return new Map([
    ["transport", { id: "transport", type: "transport", timestamp: 0, selectedCandidatePairId: "selected" }],
    ["selected", { id: "selected", type: "candidate-pair", timestamp: 0, state: "succeeded", currentRoundTripTime: 0.1 }],
    ["unused", { id: "unused", type: "candidate-pair", timestamp: 0, state: "succeeded", currentRoundTripTime: 2 }],
    ["audio", { id: "audio", type: "inbound-rtp", timestamp: 0, kind: "audio", jitterBufferDelay: delay, jitterBufferEmittedCount: emitted, packetsReceived: received, packetsLost: lost, jitter: 0.005 }],
  ]);
}

test("recent buffer delay replaces old backlog and uses the selected media path", async () => {
  const reports = [report(100, 100, 100), report(101, 110, 110)];
  const tracker = createConnectionQualityTracker({ getStats: async () => reports.shift() ?? report(101, 110, 110) });
  await tracker.read();
  const sample = await tracker.read();
  assert.ok(sample.bufferMs !== null && Math.abs(sample.bufferMs - 100) < 0.001, `recent buffer should be 100ms, got ${sample.bufferMs}`);
  assert.equal(sample.latencyMs, 150, "estimate should be selected RTT / 2 + recent jitter buffer");
});

test("no emitted audio gives unknown delay rather than a cumulative target", async () => {
  const stats = new Map<string, RTCStats>([["audio", {
    id: "audio", timestamp: 0, type: "inbound-rtp", ...{ kind: "audio", jitterBufferTargetDelay: 42, jitterBufferEmittedCount: 0 },
  }]]);
  const sample = await createConnectionQualityTracker({ getStats: async () => stats }).read();
  assert.equal(sample.bufferMs, null);
  assert.equal(sample.latencyMs, null);
});

test("counter resets and recovered packets never report negative loss", async () => {
  const reports = [report(1, 100, 100, 10), report(2, 200, 200, 8), report(0, 0, 0)];
  const tracker = createConnectionQualityTracker({ getStats: async () => reports.shift() ?? report(0, 0, 0) });
  await tracker.read();
  assert.equal((await tracker.read()).packetLossPercent, 0);
  assert.equal((await tracker.read()).packetLossPercent, null);
});
