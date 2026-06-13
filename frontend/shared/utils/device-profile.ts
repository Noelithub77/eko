export type ReceiverKind = "web" | "android";

const NAME_LIMIT = 40;

export function getSavedReceiverName(kind: ReceiverKind): string {
  const key = receiverNameKey(kind);
  const saved = readLocalValue(key);
  if (saved) {
    return saved;
  }

  const created = defaultReceiverName(kind);
  writeLocalValue(key, created);
  return created;
}

export function saveReceiverName(kind: ReceiverKind, name: string): string {
  const cleanName = cleanReceiverName(name) || defaultReceiverName(kind);
  writeLocalValue(receiverNameKey(kind), cleanName);
  return cleanName;
}

export function getSavedDeviceId(kind: ReceiverKind): string {
  const key = receiverIdKey(kind);
  const saved = readLocalValue(key);
  if (saved) {
    return saved;
  }

  const created = createDeviceId(kind);
  writeLocalValue(key, created);
  return created;
}

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

function receiverNameKey(kind: ReceiverKind): string {
  return `eko-${kind}-receiver-name`;
}

function receiverIdKey(kind: ReceiverKind): string {
  return `eko-${kind}-device-id`;
}

function readLocalValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing can block storage.
  }
}

function createDeviceId(kind: ReceiverKind): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${kind}-${crypto.randomUUID()}`;
  }

  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
