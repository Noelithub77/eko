import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveProfiler } from "../../frontend/web/client/features/playback/live-profiler.ts";
import { summarizeDevice } from "../../frontend/shared/utils/latency-summary.ts";
import type { StreamProfilerSample } from "../../frontend/shared/bindings/tauri.ts";

const now = 1_000_000;
function sample(values: Partial<StreamProfilerSample> = {}): StreamProfilerSample {
  return { version: 2, source: "web", kind: "qualitySample", deviceId: "phone", roomId: "room", connectionId: "connection", sampleIndex: 1, createdAtMs: now, latencyMs: 100, roundTripMs: 80, bufferMs: 60, jitterMs: 5, packetLossPercent: 0, packetsReceived: 100, packetsLost: 0, ...values };
}

test("device averages exclude other rooms, stale data and prior connections", () => {
  const summary = summarizeDevice([sample({ connectionId: "old", latencyMs: 900 }), sample({ roomId: "other", latencyMs: 800 }), sample({ createdAtMs: now - 31000, latencyMs: 700 }), sample({ latencyMs: 100 }), sample({ latencyMs: 200 })], "phone", "room", now);
  assert.equal(summary.delay.averageMs, 150);
  assert.equal(summary.delay.p95Ms, 200);
  assert.equal(summary.samples, 2);
  assert.equal(summarizeDevice([sample()], "phone", "room", now + 9000).delay.averageMs, null);
});

test("legacy RTT and Android buffer are never presented as measured audio delay", () => {
  const summary = summarizeDevice([sample({ version: 1, source: "android", latencyMs: 80 })], "phone", "room", now);
  assert.equal(summary.delay.averageMs, null);
  assert.equal(summary.buffer.averageMs, 60);
});

test("hosted profiles use the established signaling sender", () => {
  const sent: StreamProfilerSample[] = [];
  const profiler = createLiveProfiler({ source: "web", connectionId: "connection", deviceId: "phone", payload: { version: 1, local: { host: "127.0.0.1", port: 13370 }, hosted: { roomId: "room", joinToken: "test-only", socketUrl: "wss://example.test/socket", clientUrl: "https://example.test/client" } }, sendSample: (sample) => sent.push(sample) });
  profiler.writeQuality({ latencyMs: 100, roundTripMs: 80, bufferMs: 60, jitterMs: 5, packetLossPercent: 0, packetsReceived: 100, packetsLost: 0 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].version, 2);
  assert.equal(sent[0].roomId, "room");
  assert.equal(sent[0].roundTripMs, 80);
});
