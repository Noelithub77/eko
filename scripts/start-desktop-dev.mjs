import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const rootPath = resolve(import.meta.dirname, "..");
const targetDir = join(rootPath, "rust", "target", "desktop-dev");

if (process.platform === "win32") {
  const { execSync } = await import("node:child_process");
  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(rootPath, "scripts", "start-desktop-dev.ps1")}"`,
    { cwd: rootPath, stdio: "inherit" },
  );
} else {
  const processes = [];

  function spawnProcess(name, command, args, envOverrides) {
    const proc = spawn(command, args, {
      cwd: rootPath,
      stdio: "inherit",
      env: { ...process.env, ...envOverrides },
      shell: true,
    });
    proc.on("error", (err) => {
      console.error(`[${name}] Failed to start: ${err.message}`);
    });
    processes.push(proc);
    return proc;
  }

  const vite = spawnProcess("web-client", "npx", ["vite"], {
    PLATFORM: "web/client",
    VITE_PORT: "5174",
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const tauri = spawnProcess("tauri", "npx", ["tauri", "dev"], {
    CARGO_TARGET_DIR: targetDir,
    EKO_WEB_CLIENT_DEV_URL: "http://localhost:5174",
  });

  function cleanup() {
    for (const proc of processes) {
      proc.kill();
    }
  }

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  tauri.on("close", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  vite.on("close", () => {
    // Don't exit on Vite close — Tauri dev may still be running
  });
}
