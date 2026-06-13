import { strict as assert } from "node:assert";
import {
  allowDevice,
  denyDevice,
  isValidJoinRequest,
  markDeviceConnected,
  setDeviceSharing,
  unblockDevice,
} from "../../frontend/shared/core/session";
import type { Device, JoinRequest } from "../../frontend/shared/types/device";
import type { RoomSession } from "../../frontend/shared/types/stream";
import { parseQrPayload } from "../../frontend/shared/utils/signaling-client";

const runningSession: RoomSession = {
  status: "running",
  roomId: "room-1",
  token: "token-1",
  host: "127.0.0.1",
  port: 7777,
  lanDiscoveryEnabled: false,
  devices: [],
  metrics: [],
  events: [],
};

const validJoin: JoinRequest = {
  deviceId: "phone-1",
  deviceName: "Noel phone",
  method: "qr",
};

const pendingDevice: Device = {
  deviceId: "phone-1",
  deviceName: "Noel phone",
  label: null,
  state: "pending",
  joinMethod: "qr",
  sharing: "disabled",
  connectedAt: null,
  webRtcState: "new",
  iceState: "new",
};

assert.equal(isValidJoinRequest(runningSession, validJoin), true);
assert.equal(isValidJoinRequest(runningSession, { ...validJoin, deviceName: "" }), false);

const qrPayload = parseQrPayload(JSON.stringify({ host: "192.168.1.10", port: 4444 }));
assert.equal(qrPayload?.host, "192.168.1.10");
assert.equal(parseQrPayload(JSON.stringify({ host: "missing-port" })), null);

const allowedDevices = allowDevice([pendingDevice], "phone-1");
assert.equal(allowedDevices[0]?.state, "connecting");
assert.equal(allowedDevices[0]?.sharing, "enabled");

const connectedDevices = markDeviceConnected(allowedDevices, "phone-1");
assert.equal(connectedDevices[0]?.state, "connected");
assert.equal(connectedDevices[0]?.webRtcState, "connected");

const deniedDevices = denyDevice([pendingDevice], "phone-1");
assert.equal(deniedDevices[0]?.state, "denied");
assert.equal(deniedDevices[0]?.sharing, "disabled");

const unblockedDevices = unblockDevice(deniedDevices, "phone-1");
assert.equal(unblockedDevices.length, 0);

const mutedDevices = setDeviceSharing(connectedDevices, "phone-1", false);
assert.equal(mutedDevices[0]?.sharing, "disabled");

console.log("session core tests passed");
