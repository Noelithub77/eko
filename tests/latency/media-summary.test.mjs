import assert from "node:assert/strict";
import test from "node:test";
import { mediaSummary } from "../../scripts/latency/media.mjs";

test("aggregate media output excludes session traces and peer identity without changing the live result", () => {
  const result = {
    success: true, samples: [{ deviceId: "session-device", latencyMs: 42 }],
    markerMatches: [{ emittedAt: 10 }], estimatedDelay: { averageMs: 42 },
    pipeline: { encodeTiming: { samples: 50, averageMs: .4 }, peers: [{ deviceId: "session-device", selectedCandidateType: "relay" }] },
  };
  const summary = mediaSummary(result);
  assert.equal("samples" in summary, false);
  assert.equal("markerMatches" in summary, false);
  assert.equal(JSON.stringify(summary).includes("session-device"), false);
  assert.deepEqual(summary.estimatedDelay, { averageMs: 42 });
  assert.equal(summary.pipeline.encodeTiming.samples, 50);
  assert.equal(result.samples[0].deviceId, "session-device");
});
