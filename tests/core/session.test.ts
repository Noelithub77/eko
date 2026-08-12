import { strict as assert } from "node:assert";
import {
  allowDevice,
  denyDevice,
  disconnectDevice,
  isValidJoinRequest,
  markDeviceConnected,
  unblockDevice,
} from "../../frontend/shared/core/session";
import type { Device, JoinRequest } from "../../frontend/shared/types/device";
import type { RoomSession } from "../../frontend/shared/types/stream";
import { createPairingLink, parsePairingSource } from "../../frontend/shared/utils/pairing-link";
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
  connectedAt: null,
  webRtcState: "new",
  iceState: "new",
};

assert.equal(isValidJoinRequest(runningSession, validJoin), true);
assert.equal(isValidJoinRequest(runningSession, { ...validJoin, deviceName: "" }), false);

const qrPayload = parseQrPayload(JSON.stringify({ host: "192.168.1.10", port: 4444 }));
assert.equal(qrPayload?.local.host, "192.168.1.10");
assert.equal(parseQrPayload(JSON.stringify({ host: "missing-port" })), null);

const hostedPayload = {
  version: 1,
  local: { host: "192.168.1.20", port: 13370 },
  hosted: {
    roomId: "00000000-0000-4000-8000-000000000000",
    joinToken: "a".repeat(64),
    socketUrl:
      "wss://eko.noelmcv7.workers.dev/v1/rooms/00000000-0000-4000-8000-000000000000/socket",
    clientUrl: "https://eko.noelmcv7.workers.dev/client",
  },
};
const compactLink = createPairingLink(hostedPayload);
const parsedHostedPayload = parsePairingSource(compactLink);
assert.ok(compactLink.length < 300);
assert.deepEqual(parsedHostedPayload, hostedPayload);

const allowedDevices = allowDevice([pendingDevice], "phone-1");
assert.equal(allowedDevices[0]?.state, "connecting");

const connectedDevices = markDeviceConnected(allowedDevices, "phone-1");
assert.equal(connectedDevices[0]?.state, "connected");
assert.equal(connectedDevices[0]?.webRtcState, "connected");

const deniedDevices = denyDevice([pendingDevice], "phone-1");
assert.equal(deniedDevices[0]?.state, "denied");

const unblockedDevices = unblockDevice(deniedDevices, "phone-1");
assert.equal(unblockedDevices.length, 0);

const forgottenDevices = disconnectDevice(connectedDevices, "phone-1");
assert.equal(forgottenDevices.length, 0);

console.log("session core tests passed");
