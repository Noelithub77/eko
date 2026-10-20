import assert from "node:assert/strict";
import { test } from "node:test";
import { HostSession } from "../../extension/runtime/session";
import { parseReceiverSignal } from "../../extension/runtime/signals";

test("joining never approves a listener, and denial survives repeated join requests", () => {
  const session = new HostSession("room", "token");
  const request = { deviceId: "phone", deviceName: "Phone", method: "qr" } as const;
  assert.equal(session.allow("unknown"), false);
  session.request(request);
  assert.equal(session.approved("phone"), false);
  assert.equal(session.devices[0].state, "pending");
  assert.equal(session.allow("phone"), true);
  assert.equal(session.allow("phone"), false);
  assert.equal(session.approved("phone"), true);
  session.deny("phone");
  session.request(request);
  assert.equal(session.approved("phone"), false);
  assert.equal(session.devices[0].state, "denied");
  session.unblock("phone");
  assert.equal(session.devices.length, 0);
  session.request(request);
  assert.equal(session.devices[0].state, "pending");
});
test("a disconnected listener must ask for fresh approval", () => {
  const session = new HostSession("room", "token");
  const request = { deviceId: "phone", deviceName: "Phone", method: "qr" } as const;
  session.request(request); session.allow("phone"); session.connected("phone");
  session.disconnect("phone"); session.request(request);
  assert.equal(session.approved("phone"), false);
  assert.equal(session.devices[0].state, "pending");
  const snapshot = session.snapshot();
  assert.equal(snapshot.devices[0].joinMethod, "qr");
  assert.equal(snapshot.devices[0].webRtcState, "new");
  assert.equal(snapshot.devices[0].iceState, "new");
  assert.equal(snapshot.lanDiscoveryEnabled, false);
});

test("payload device identity must match the authenticated relay identity", () => {
  assert.equal(parseReceiverSignal("a", { kind: "joinRequest", request: { deviceId: "b", deviceName: "Phone", method: "qr" } }), null);
  assert.equal(parseReceiverSignal("a", { kind: "receiverReady", deviceId: "b" }), null);
  assert.equal(parseReceiverSignal("a", { kind: "answer", description: { deviceId: "b", sdp: "answer" } }), null);
  assert.equal(parseReceiverSignal("a", { kind: "iceCandidate", candidate: { deviceId: "b", candidate: "{}" } }), null);
  assert.equal(parseReceiverSignal("a", { kind: "updateReceiverName", deviceId: "b", name: "Phone" }), null);
  assert.ok(parseReceiverSignal("a", { kind: "receiverReady", deviceId: "a" }));
  assert.equal(parseReceiverSignal("a", { kind: "answer", description: { deviceId: "a", sdp: 123 } }), null);
});
