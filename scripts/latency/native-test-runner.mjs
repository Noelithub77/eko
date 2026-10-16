import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function nativeTestArguments() {
  if (process.platform !== "win32") return [];
  const runner = fileURLToPath(new URL("./native-test-runner.mjs", import.meta.url));
  return ["--config", `target.'cfg(windows)'.runner=${JSON.stringify([process.execPath, runner])}`];
}

function manifestTool() {
  if (process.env.EKO_MANIFEST_TOOL) return process.env.EKO_MANIFEST_TOOL;
  const sdk = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  if (!existsSync(sdk)) throw new Error("The Windows SDK manifest tool is missing; prepare the C++ build tools first.");
  const versions = readdirSync(sdk).filter((name) => /^\d+\.\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const architecture = process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "x86" : "x64";
  const tool = versions.map((version) => join(sdk, version, architecture, "mt.exe")).find(existsSync);
  if (!tool) throw new Error("No Windows SDK mt.exe was found for the current architecture.");
  return tool;
}

// Tauri's app manifest does not reach Cargo's library test executable.
function run() {
  if (process.platform !== "win32") throw new Error("This test runner is Windows-only.");
  const [executable, ...args] = process.argv.slice(2);
  if (!executable || !existsSync(executable)) throw new Error("Cargo did not supply a native test executable.");
  const manifest = fileURLToPath(new URL("../../tests/latency/windows.manifest", import.meta.url));
  const prepared = spawnSync(manifestTool(), ["-nologo", "-manifest", manifest, `-outputresource:${executable};#1`], { encoding: "utf8", timeout: 30000 });
  if (prepared.error || prepared.status !== 0) throw new Error(prepared.error?.message ?? (prepared.stderr.trim() || prepared.stdout.trim() || "Could not prepare the Windows test manifest."));
  const child = spawn(executable, args, { stdio: "inherit" });
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { run(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
