import { create } from "zustand";
import {
  addDevJoinRequest,
  allowDevice,
  denyDevice,
  disconnectDevice,
  getRoomSession,
  setDeviceSharing,
  setLanDiscovery,
  startStream,
  stopStream,
  unblockDevice,
} from "../utils/api";
import type { QrPairingPayload, RoomSession } from "../types/stream";

type StreamState = {
  session: RoomSession | null;
  qrPayload: QrPairingPayload | null;
  errorMessage: string | null;
  refreshSession: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggleLanDiscovery: (enabled: boolean) => Promise<void>;
  allow: (deviceId: string) => Promise<void>;
  deny: (deviceId: string) => Promise<void>;
  unblock: (deviceId: string) => Promise<void>;
  disconnect: (deviceId: string) => Promise<void>;
  toggleSharing: (deviceId: string, enabled: boolean) => Promise<void>;
  addTestDevice: (deviceName: string, method: "qr" | "discovery") => Promise<void>;
};

async function runSessionAction(action: () => Promise<RoomSession>): Promise<RoomSession> {
  return await action();
}

export const useStreamStore = create<StreamState>()((set) => ({
  session: null,
  qrPayload: null,
  errorMessage: null,
  refreshSession: async () => {
    try {
      set({ session: await getRoomSession(), errorMessage: null });
    } catch (error) {
      set({
        errorMessage: error instanceof Error ? error.message : "Could not load stream state.",
      });
    }
  },
  start: async () => {
    try {
      const result = await startStream();
      set({ session: result.session, qrPayload: result.qrPayload, errorMessage: null });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : "Could not start stream." });
    }
  },
  stop: async () => {
    const session = await runSessionAction(stopStream);
    set({ session, qrPayload: null, errorMessage: null });
  },
  toggleLanDiscovery: async (enabled) => {
    set({ session: await runSessionAction(() => setLanDiscovery(enabled)), errorMessage: null });
  },
  allow: async (deviceId) => {
    set({ session: await runSessionAction(() => allowDevice(deviceId)), errorMessage: null });
  },
  deny: async (deviceId) => {
    set({ session: await runSessionAction(() => denyDevice(deviceId)), errorMessage: null });
  },
  unblock: async (deviceId) => {
    set({ session: await runSessionAction(() => unblockDevice(deviceId)), errorMessage: null });
  },
  disconnect: async (deviceId) => {
    set({ session: await runSessionAction(() => disconnectDevice(deviceId)), errorMessage: null });
  },
  toggleSharing: async (deviceId, enabled) => {
    set({
      session: await runSessionAction(() => setDeviceSharing(deviceId, enabled)),
      errorMessage: null,
    });
  },
  addTestDevice: async (deviceName, method) => {
    set({
      session: await runSessionAction(() => addDevJoinRequest(deviceName, method)),
      errorMessage: null,
    });
  },
}));
