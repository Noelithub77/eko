import { commands } from "../bindings/tauri";
import type {
  CoreProofStatus,
  DiscoveredHost,
  JoinMethod,
  JoinRequest,
  RoomSession,
  StartStreamResult,
} from "../bindings/tauri";

export function greet(name: string): Promise<string> {
  return commands.greet(name);
}

export function startStream(): Promise<StartStreamResult> {
  return commands.startStream();
}

export function stopStream(): Promise<RoomSession> {
  return commands.stopStream();
}

export function getRoomSession(): Promise<RoomSession> {
  return commands.getRoomSession();
}

export function setLanDiscovery(enabled: boolean): Promise<RoomSession> {
  return commands.setLanDiscovery(enabled);
}

export function allowDevice(deviceId: string): Promise<RoomSession> {
  return commands.allowDevice(deviceId);
}

export function denyDevice(deviceId: string): Promise<RoomSession> {
  return commands.denyDevice(deviceId);
}

export function unblockDevice(deviceId: string): Promise<RoomSession> {
  return commands.unblockDevice(deviceId);
}

export function disconnectDevice(deviceId: string): Promise<RoomSession> {
  return commands.disconnectDevice(deviceId);
}

export function setDeviceSharing(deviceId: string, enabled: boolean): Promise<RoomSession> {
  return commands.setDeviceSharing(deviceId, enabled);
}

export function submitJoinRequest(request: JoinRequest): Promise<RoomSession> {
  return commands.submitJoinRequest(request);
}

export function addDevJoinRequest(deviceName: string, method: JoinMethod): Promise<RoomSession> {
  return commands.addDevJoinRequest(deviceName, method);
}

export function getCoreProofStatus(): Promise<CoreProofStatus> {
  return commands.getCoreProofStatus();
}

export function findNearbyHosts(): Promise<DiscoveredHost[]> {
  return commands.findNearbyHosts();
}
