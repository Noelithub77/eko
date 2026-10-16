import { version } from "../../../package.json";

export type Platform = "windows" | "linux" | "android";
export type Device = Platform | "ios" | "macos" | null;

type Build = { file: string; label: string };

const repository = "https://github.com/Noelithub77/eko";
const tag = `eko-v${version}`;

// File names follow the Tauri release workflow; `pnpm ops check` verifies they exist.
export const builds: Record<Platform, Build> = {
  windows: { file: `eko_${version}_x64-setup.exe`, label: "Download" },
  linux: { file: `eko_${version}_amd64.AppImage`, label: "Download AppImage" },
  android: { file: `eko-${version}-android-aarch64.apk`, label: "Download APK" },
};

export const releaseUrl = `${repository}/releases/tag/${tag}`;

export function downloadUrl(platform: Platform): string {
  return `${repository}/releases/download/${tag}/${builds[platform].file}`;
}

/** Best guess of the visitor's device; iPadOS reports a Mac with touch points. */
export function detectDevice(platform: string, userAgent: string, touchPoints = 0): Device {
  const text = `${platform} ${userAgent}`;
  if (/android/i.test(text)) return "android";
  if (/iphone|ipad|ipod/i.test(text)) return "ios";
  if (/mac/i.test(text)) return touchPoints > 1 ? "ios" : "macos";
  if (/win/i.test(text)) return "windows";
  if (/linux|x11|cros/i.test(text)) return "linux";
  return null;
}

/** The tab to open first. Devices without a build start on Windows. */
export function defaultPlatform(device: Device): Platform {
  return device === "linux" || device === "android" ? device : "windows";
}
