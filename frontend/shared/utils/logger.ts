import { attachConsole, error as logPluginError } from "@tauri-apps/plugin-log";

let consoleAttached = false;

export async function initAppLogging(): Promise<void> {
  if (!isTauriRuntime() || consoleAttached) {
    return;
  }

  try {
    await attachConsole();
    consoleAttached = true;
  } catch (error) {
    console.error("Could not attach Eko app logs.", formatError(error));
  }
}

export async function logError(area: string, error: unknown): Promise<void> {
  const message = `${area}: ${formatError(error)}`;

  if (!isTauriRuntime()) {
    console.error(message);
    return;
  }

  try {
    await logPluginError(message);
  } catch {
    console.error(message);
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error.";
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
