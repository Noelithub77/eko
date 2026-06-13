import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  addDevJoinRequest,
  allowDevice,
  clearSessionEvents,
  denyDevice,
  disconnectDevice,
  getRoomSession,
  setDeviceSharing,
  startStream,
  unblockDevice,
} from "../utils/api";
import type { QrPairingPayload, RoomSession } from "../types/stream";
import { formatError, logError } from "../utils/logger";

const ROOM_SESSION_EVENT = "room-session-updated";

type StreamState = {
  session: RoomSession | null;
  qrPayload: QrPairingPayload | null;
  errorMessage: string | null;
  listenToSessionEvents: () => Promise<UnlistenFn>;
  refreshSession: () => Promise<void>;
  start: () => Promise<void>;
  restart: () => Promise<void>;
  allow: (deviceId: string) => Promise<void>;
  deny: (deviceId: string) => Promise<void>;
  unblock: (deviceId: string) => Promise<void>;
  disconnect: (deviceId: string) => Promise<void>;
  toggleSharing: (deviceId: string, enabled: boolean) => Promise<void>;
  addTestDevice: (deviceName: string, method: "qr" | "discovery") => Promise<void>;
  clearEvents: () => Promise<void>;
};

async function runSessionAction(action: () => Promise<RoomSession>): Promise<RoomSession> {
  return await action();
}

export const useStreamStore = create<StreamState>()((set) => ({
  session: null,
  qrPayload: null,
  errorMessage: null,
  listenToSessionEvents: async () => {
    if (!isTauriRuntime()) {
      return () => undefined;
    }

    return await listen<RoomSession>(ROOM_SESSION_EVENT, (event) => {
      set({ session: event.payload, errorMessage: null });
    });
  },
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
  restart: async () => {
    try {
      const result = await startStream();
      set({ session: result.session, qrPayload: result.qrPayload, errorMessage: null });
    } catch (error) {
      void logError("Restart stream failed", error);
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
  clearEvents: async () => {
    try {
      set({
        session: await runSessionAction(() => clearSessionEvents()),
        errorMessage: null,
      });
    } catch (error) {
      void logError("Clear monitor logs failed", error);
      set({ errorMessage: formatError(error) });
    }
  },
}));

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
