import { Store } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import type { DevEvent } from "../types/stream";

type MonitorLogState = {
  logs: DevEvent[];
  isLoaded: boolean;
  loadLogs: () => Promise<void>;
  recordLogs: (events: DevEvent[]) => Promise<void>;
  clearLogs: () => Promise<void>;
};

type StoredMonitorLogs = {
  logs?: DevEvent[];
};

const MONITOR_LOG_PATH = "monitor-logs.json";
const MONITOR_LOG_KEY = "eko-monitor-logs";
const MAX_MONITOR_LOGS = 300;

async function loadStore(): Promise<Store | null> {
  try {
    return await Store.load(MONITOR_LOG_PATH);
  } catch {
    return null;
  }
}

async function saveLogs(logs: DevEvent[]): Promise<void> {
  const store = await loadStore();

  if (!store) {
    return;
  }

  await store.set(MONITOR_LOG_KEY, { logs });
  await store.save();
}

function mergeLogs(currentLogs: DevEvent[], nextLogs: DevEvent[]): DevEvent[] {
  const logsById = new Map<string, DevEvent>();

  for (const log of [...currentLogs, ...nextLogs]) {
    logsById.set(log.id, log);
  }

  return [...logsById.values()]
    .sort((first, second) => Number(first.createdAt) - Number(second.createdAt))
    .slice(-MAX_MONITOR_LOGS);
}

export const useMonitorLogStore = create<MonitorLogState>()((set, get) => ({
  logs: [],
  isLoaded: false,
  loadLogs: async () => {
    const store = await loadStore();
    const storedLogs = store ? await store.get<StoredMonitorLogs>(MONITOR_LOG_KEY) : null;

    set({
      logs: storedLogs?.logs ?? [],
      isLoaded: true,
    });
  },
  recordLogs: async (events) => {
    if (events.length === 0) {
      return;
    }

    const nextLogs = mergeLogs(get().logs, events);
    set({ logs: nextLogs });
    await saveLogs(nextLogs);
  },
  clearLogs: async () => {
    set({ logs: [] });
    await saveLogs([]);
  },
}));
