import { invoke } from "@tauri-apps/api/core";
import type { JoinRequest } from "../types/device";
import type { RoomSession, StartStreamResult } from "../types/stream";

export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

export function startStream(): Promise<StartStreamResult> {
  return invoke<StartStreamResult>("start_stream");
}

export function stopStream(): Promise<RoomSession> {
  return invoke<RoomSession>("stop_stream");
}

export function getRoomSession(): Promise<RoomSession> {
  return invoke<RoomSession>("get_room_session");
}

export function setLanDiscovery(enabled: boolean): Promise<RoomSession> {
  return invoke<RoomSession>("set_lan_discovery", { enabled });
}

export function allowDevice(deviceId: string): Promise<RoomSession> {
  return invoke<RoomSession>("allow_device", { deviceId });
}

export function denyDevice(deviceId: string): Promise<RoomSession> {
  return invoke<RoomSession>("deny_device", { deviceId });
}

export function unblockDevice(deviceId: string): Promise<RoomSession> {
  return invoke<RoomSession>("unblock_device", { deviceId });
}

export function disconnectDevice(deviceId: string): Promise<RoomSession> {
  return invoke<RoomSession>("disconnect_device", { deviceId });
}

export function setDeviceSharing(deviceId: string, enabled: boolean): Promise<RoomSession> {
  return invoke<RoomSession>("set_device_sharing", { deviceId, enabled });
}

export function submitJoinRequest(request: JoinRequest): Promise<RoomSession> {
  return invoke<RoomSession>("submit_join_request", { request });
}

export function addDevJoinRequest(
  deviceName: string,
  method: "qr" | "discovery",
): Promise<RoomSession> {
  return invoke<RoomSession>("add_dev_join_request", { deviceName, method });
}
