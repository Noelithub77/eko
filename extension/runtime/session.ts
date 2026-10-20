import type { Device, JoinRequest, RoomSession } from "../../frontend/shared/bindings/tauri";
import { allowDevice, denyDevice, markDeviceConnected } from "../../frontend/shared/core/session";

export class HostSession {
  devices: Device[] = [];
  constructor(readonly roomId: string, private readonly joinToken: string) {}

  request(request: JoinRequest): boolean {
    const current = this.devices.find((device) => device.deviceId === request.deviceId);
    if (current && current.state !== "disconnected" && current.state !== "failed") return false;
    this.devices = this.devices.filter((device) => device.deviceId !== request.deviceId);
    this.devices.push({ deviceId: request.deviceId, deviceName: request.deviceName, label: null,
      joinMethod: request.method, state: "pending", connectedAt: null, webRtcState: "new", iceState: "new", connectionPath: null });
    return true;
  }
  approved(deviceId: string): boolean {
    return this.devices.some((device) => device.deviceId === deviceId && (device.state === "connecting" || device.state === "connected"));
  }
  allow(deviceId: string): boolean {
    if (!this.devices.some((device) => device.deviceId === deviceId && device.state === "pending")) return false;
    this.devices = allowDevice(this.devices, deviceId);
    return true;
  }
  deny(deviceId: string) { this.devices = denyDevice(this.devices, deviceId); }
  connected(deviceId: string) { if (this.approved(deviceId)) this.devices = markDeviceConnected(this.devices, deviceId); }
  disconnect(deviceId: string) {
    this.devices = this.devices.map((device) => device.deviceId === deviceId && device.state !== "denied"
      ? { ...device, state: "disconnected", webRtcState: "closed", iceState: "closed" } : device);
  }
  unblock(deviceId: string) {
    this.devices = this.devices.filter((device) => device.deviceId !== deviceId || device.state !== "denied");
  }
  snapshot(): RoomSession {
    return { status: "running", roomId: this.roomId, token: this.joinToken, host: null, port: null,
      lanDiscoveryEnabled: false, devices: this.devices, metrics: [], events: [] };
  }
}
