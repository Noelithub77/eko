import { isTauri } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type CachedUpdate = {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  checkedAt: string;
};

const UPDATE_CACHE_PATH = "update-cache.json";
const UPDATE_CACHE_KEY = "available-update";

export async function checkForDesktopUpdate(): Promise<Update | null> {
  if (!isTauri()) {
    return null;
  }

  return check({ timeout: 10_000 });
}

export async function loadCachedUpdate(): Promise<CachedUpdate | null> {
  if (!isTauri()) {
    return null;
  }

  const store = await loadUpdateStore();
  if (!store) {
    return null;
  }

  const cachedUpdate = await store.get<CachedUpdate>(UPDATE_CACHE_KEY);
  return isCachedUpdate(cachedUpdate) ? cachedUpdate : null;
}

export async function saveCachedUpdate(update: Update): Promise<CachedUpdate> {
  const cachedUpdate: CachedUpdate = {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
    checkedAt: new Date().toISOString(),
  };

  const store = await loadUpdateStore();
  if (store) {
    await store.set(UPDATE_CACHE_KEY, cachedUpdate);
    await store.save();
  }

  return cachedUpdate;
}

export async function clearCachedUpdate(): Promise<void> {
  const store = await loadUpdateStore();
  if (!store) {
    return;
  }

  await store.delete(UPDATE_CACHE_KEY);
  await store.save();
}

export function isNewerVersion(version: string, baseVersion: string): boolean {
  const versionParts = parseVersion(version);
  const baseParts = parseVersion(baseVersion);

  if (!versionParts || !baseParts) {
    return version !== baseVersion;
  }

  for (let index = 0; index < versionParts.length; index += 1) {
    const versionPart = versionParts[index];
    const basePart = baseParts[index];

    if (versionPart > basePart) {
      return true;
    }
    if (versionPart < basePart) {
      return false;
    }
  }

  return false;
}

async function loadUpdateStore(): Promise<Store | null> {
  try {
    return await Store.load(UPDATE_CACHE_PATH);
  } catch {
    return null;
  }
}

function isCachedUpdate(value: unknown): value is CachedUpdate {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CachedUpdate>;
  return (
    typeof candidate.version === "string" &&
    typeof candidate.currentVersion === "string" &&
    typeof candidate.checkedAt === "string"
  );
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
