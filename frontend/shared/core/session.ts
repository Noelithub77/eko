import type { Device, JoinRequest } from "../types/device";
import type { RoomSession } from "../types/stream";

export function isValidJoinRequest(session: RoomSession, request: JoinRequest): boolean {
  return Boolean(
    session.status === "running" &&
      request.deviceId.trim().length > 0 &&
      request.deviceName.trim().length > 0,
  );
}

export function allowDevice(devices: Device[], deviceId: string): Device[] {
  return devices.map((device) =>
    device.deviceId === deviceId
      ? {
          ...device,
          state: "connecting",
          connectedAt: new Date().toISOString(),
          webRtcState: "connecting",
          iceState: "checking",
        }
      : device,
  );
}

export function markDeviceConnected(devices: Device[], deviceId: string): Device[] {
  return devices.map((device) =>
    device.deviceId === deviceId
      ? {
          ...device,
          state: "connected",
          connectedAt: device.connectedAt ?? new Date().toISOString(),
          webRtcState: "connected",
          iceState: "connected",
        }
      : device,
  );
}

export function denyDevice(devices: Device[], deviceId: string): Device[] {
  return devices.map((device) =>
    device.deviceId === deviceId
      ? {
          ...device,
          state: "denied",
          webRtcState: "closed",
          iceState: "closed",
        }
      : device,
  );
}

export function unblockDevice(devices: Device[], deviceId: string): Device[] {
  return devices.filter((device) => device.deviceId !== deviceId);
}

export function disconnectDevice(devices: Device[], deviceId: string): Device[] {
  return devices.filter((device) => device.deviceId !== deviceId);
}
