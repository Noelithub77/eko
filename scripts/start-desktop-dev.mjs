import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const rootPath = resolve(import.meta.dirname, "..");
const targetDir = join(rootPath, "rust", "target", "desktop-dev");

if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(rootPath, "scripts", "start-desktop-dev.ps1")}"`,
    { cwd: rootPath, stdio: "inherit" },
  );
} else {
  execSync("npx tauri dev", {
    cwd: rootPath,
    stdio: "inherit",
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
  });
}
