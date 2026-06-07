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
import { formatError, logError } from "../utils/logger";

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
      void logError("Load stream state failed", error);
      set({
        errorMessage: formatError(error),
      });
    }
  },
  start: async () => {
    try {
      const result = await startStream();
      set({ session: result.session, qrPayload: result.qrPayload, errorMessage: null });
    } catch (error) {
      void logError("Start stream failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  stop: async () => {
    try {
      const session = await runSessionAction(stopStream);
      set({ session, qrPayload: null, errorMessage: null });
    } catch (error) {
      void logError("Stop stream failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  toggleLanDiscovery: async (enabled) => {
    try {
      set({ session: await runSessionAction(() => setLanDiscovery(enabled)), errorMessage: null });
    } catch (error) {
      void logError("LAN discovery toggle failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  allow: async (deviceId) => {
    try {
      set({ session: await runSessionAction(() => allowDevice(deviceId)), errorMessage: null });
    } catch (error) {
      void logError("Allow device failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  deny: async (deviceId) => {
    try {
      set({ session: await runSessionAction(() => denyDevice(deviceId)), errorMessage: null });
    } catch (error) {
      void logError("Deny device failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  unblock: async (deviceId) => {
    try {
      set({ session: await runSessionAction(() => unblockDevice(deviceId)), errorMessage: null });
    } catch (error) {
      void logError("Unblock device failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  disconnect: async (deviceId) => {
    try {
      set({
        session: await runSessionAction(() => disconnectDevice(deviceId)),
        errorMessage: null,
      });
    } catch (error) {
      void logError("Disconnect device failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  toggleSharing: async (deviceId, enabled) => {
    try {
      set({
        session: await runSessionAction(() => setDeviceSharing(deviceId, enabled)),
        errorMessage: null,
      });
    } catch (error) {
      void logError("Device sharing toggle failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
  addTestDevice: async (deviceName, method) => {
    try {
      set({
        session: await runSessionAction(() => addDevJoinRequest(deviceName, method)),
        errorMessage: null,
      });
    } catch (error) {
      void logError("Add test device failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
}));
