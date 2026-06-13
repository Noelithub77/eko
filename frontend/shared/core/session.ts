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
          sharing: "enabled",
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
          sharing: "enabled",
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
          sharing: "disabled",
          webRtcState: "closed",
          iceState: "closed",
        }
      : device,
  );
}

export function unblockDevice(devices: Device[], deviceId: string): Device[] {
  return devices.filter((device) => device.deviceId !== deviceId);
}

export function setDeviceSharing(devices: Device[], deviceId: string, enabled: boolean): Device[] {
  return devices.map((device) =>
    device.deviceId === deviceId
      ? { ...device, sharing: enabled ? "enabled" : "disabled" }
      : device,
  );
}
