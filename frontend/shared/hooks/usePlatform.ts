import type { Platform } from "../types";

export function usePlatform(): Platform {
  if ("window" in globalThis && "Android" in navigator) {
    return "mobile";
  }
  return "desktop";
}
