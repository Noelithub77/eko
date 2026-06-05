import { Store } from "@tauri-apps/plugin-store";
import { create } from "zustand";

type DeviceLabel = {
  deviceId: string;
  label: string;
};

type SettingsState = {
  devMode: boolean;
  deviceLabels: DeviceLabel[];
  isLoaded: boolean;
  setDevMode: (enabled: boolean) => Promise<void>;
  setDeviceLabel: (deviceId: string, label: string) => Promise<void>;
  loadSettings: () => Promise<void>;
};

type StoredSettings = {
  devMode?: boolean;
  deviceLabels?: DeviceLabel[];
};

const SETTINGS_PATH = "settings.json";
const SETTINGS_KEY = "eko-settings";

async function loadStore(): Promise<Store | null> {
  try {
    return await Store.load(SETTINGS_PATH);
  } catch {
    return null;
  }
}

async function saveSettings(settings: StoredSettings): Promise<void> {
  const store = await loadStore();

  if (!store) {
    return;
  }

  await store.set(SETTINGS_KEY, settings);
  await store.save();
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  devMode: false,
  deviceLabels: [],
  isLoaded: false,
  setDevMode: async (enabled) => {
    const nextSettings = { devMode: enabled, deviceLabels: get().deviceLabels };
    set({ devMode: enabled });
    await saveSettings(nextSettings);
  },
  setDeviceLabel: async (deviceId, label) => {
    const nextLabels = [
      ...get().deviceLabels.filter((deviceLabel) => deviceLabel.deviceId !== deviceId),
      { deviceId, label },
    ];
    set({ deviceLabels: nextLabels });
    await saveSettings({ devMode: get().devMode, deviceLabels: nextLabels });
  },
  loadSettings: async () => {
    const store = await loadStore();
    const storedSettings = store ? await store.get<StoredSettings>(SETTINGS_KEY) : null;

    set({
      devMode: storedSettings?.devMode ?? false,
      deviceLabels: storedSettings?.deviceLabels ?? [],
      isLoaded: true,
    });
  },
}));
