import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ReceiverKind = "web" | "android";

type ReceiverProfile = {
  deviceId: string;
  name: string;
};

type DeviceProfileState = {
  profiles: Record<ReceiverKind, ReceiverProfile>;
  setReceiverName: (kind: ReceiverKind, name: string) => void;
  finalReceiverName: (kind: ReceiverKind) => string;
};

const NAME_LIMIT = 40;

export const useDeviceProfileStore = create<DeviceProfileState>()(
  persist(
    (set, get) => ({
      profiles: {
        web: {
          deviceId: createDeviceId("web"),
          name: defaultReceiverName("web"),
        },
        android: {
          deviceId: createDeviceId("android"),
          name: defaultReceiverName("android"),
        },
      },
      setReceiverName: (kind, name) => {
        set((state) => ({
          profiles: {
            ...state.profiles,
            [kind]: {
              ...state.profiles[kind],
              name: name.slice(0, NAME_LIMIT),
            },
          },
        }));
      },
      finalReceiverName: (kind) => {
        const profile = get().profiles[kind];
        const name = cleanReceiverName(profile.name) || defaultReceiverName(kind);
        set((state) => ({
          profiles: {
            ...state.profiles,
            [kind]: {
              ...state.profiles[kind],
              name,
            },
          },
        }));
        return name;
      },
    }),
    {
      name: "eko-device-profile",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ profiles: state.profiles }),
    },
  ),
);

function defaultReceiverName(kind: ReceiverKind): string {
  if (kind === "android") {
    return "Android phone";
  }

  const browser = browserName();
  const platform = platformName();
  return `${browser} on ${platform}`;
}

function browserName(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Edg/")) return "Edge";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/")) return "Safari";
  return "Web browser";
}

function platformName(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Android")) return "Android";
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Mac OS")) return "Mac";
  if (userAgent.includes("Linux")) return "Linux";
  return "this device";
}

function cleanReceiverName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, NAME_LIMIT);
}

function createDeviceId(kind: ReceiverKind): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${kind}-${crypto.randomUUID()}`;
  }

  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
