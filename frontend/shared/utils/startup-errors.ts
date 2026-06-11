import { formatError, logError } from "./logger";

export function installStartupErrorLogging(): () => void {
  const handleError = (event: ErrorEvent) => {
    const error = event.error ?? event.message;
    void logError("Global app error", error);
    renderStartupError(formatError(error));
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    void logError("Unhandled app promise rejection", event.reason);
    renderStartupError(formatError(event.reason));
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
}

export function renderStartupError(message: string): void {
  const root = document.getElementById("root");
  const hasStartupFallback = root?.querySelector("[data-startup-fallback]") !== null;

  if (!root || (root.children.length > 0 && !hasStartupFallback)) {
    return;
  }

  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#111;color:#f4f4f5;padding:24px;font-family:'Nunito',sans-serif;">
      <section style="max-width:560px;border:1px solid #333;border-radius:18px;background:#18181b;padding:24px;">
        <h1 style="font-size:22px;margin:0 0 8px;">Eko could not start</h1>
        <p style="color:#a1a1aa;margin:0 0 16px;">The app hit a startup error. The details were logged.</p>
        <pre style="white-space:pre-wrap;overflow:auto;max-height:180px;background:#27272a;border-radius:12px;padding:12px;">${escapeHtml(message)}</pre>
        <button style="margin-top:16px;border:0;border-radius:999px;padding:10px 16px;cursor:pointer;" onclick="window.location.reload()">Reload</button>
      </section>
    </main>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
