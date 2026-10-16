import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export const localDeployHelp = `pnpm ops local:deploy [--dry-run] [--json]

Build the optimized Linux desktop app and embedded browser receiver, then install
an eko command in ~/.local/bin and a desktop launcher in the user data directory.
Keeps versioned binaries and preserves settings, sessions, and running windows.
Uses the existing Cargo release cache and sccache when available.

  --dry-run  Report the build command and install paths without building or writing.
  --help     Show this help. Requires Linux; Windows uses the release installer.

Build prerequisites: pnpm dependencies, Rust, and Tauri Linux system libraries.
No release is published and no app is launched or restarted.`;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function inspect(path: string) {
  try { return await lstat(path); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function inside(directory: string, path: string): boolean {
  const child = relative(directory, path);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function execPath(path: string): string {
  return `"${path.replace(/%/g, "%%").replace(/[\\"`$]/g, "\\$&")}"`;
}

type InstallPaths = {
  binary: string;
  icon: string;
  binDirectory: string;
  dataDirectory: string;
  revision: string;
};

export async function installLocalBuild(paths: InstallPaths) {
  const { binary, icon, binDirectory, dataDirectory, revision } = paths;
  const builds = join(dataDirectory, "eko", "builds");
  const command = join(binDirectory, "eko");
  const desktop = join(dataDirectory, "applications", "eko.desktop");
  const marker = "X-Eko-Local-Deploy=true";
  for (const path of [binary, icon]) {
    if (!(await lstat(path)).isFile()) throw new Error(`Build artifact is not a file: ${path}`);
  }
  if (await inspect(command)) {
    const existing = await lstat(command);
    if (!existing.isSymbolicLink() || !inside(builds, resolve(binDirectory, await readlink(command)))) {
      throw new Error(`Preserving an unrelated eko command at ${command}`);
    }
  }
  let previousDesktop: string | null = null;
  if (await inspect(desktop)) {
    if (!(await lstat(desktop)).isFile()) throw new Error(`Preserving an unrelated desktop launcher at ${desktop}`);
    previousDesktop = await readFile(desktop, "utf8");
    if (!previousDesktop.split(/\r?\n/).includes(marker) && !/^Name=eko\s*$/im.test(previousDesktop)) {
      throw new Error(`Preserving an unrelated desktop launcher at ${desktop}`);
    }
  }

  const buildDirectory = join(builds, `${Date.now()}-${revision}-${randomUUID().slice(0, 8)}`);
  const installed = join(buildDirectory, "eko");
  const installedIcon = join(buildDirectory, "icon.png");
  const temporaryLink = join(binDirectory, `.eko-${randomUUID()}`);
  const temporaryDesktop = `${desktop}.${randomUUID()}.tmp`;
  await mkdir(buildDirectory, { recursive: true });
  try {
    if (previousDesktop !== null) await writeFile(join(buildDirectory, "previous.desktop"), previousDesktop);
    await copyFile(binary, installed);
    await chmod(installed, 0o755);
    await copyFile(icon, installedIcon);
    const sha256 = await digest(binary);
    if (sha256 !== await digest(installed)) throw new Error("Installed binary checksum does not match the build");
    await mkdir(binDirectory, { recursive: true });
    await mkdir(dirname(desktop), { recursive: true });
    await symlink(installed, temporaryLink);
    await writeFile(temporaryDesktop, [
      "[Desktop Entry]", "Type=Application", "Name=eko", "Comment=Share computer audio with approved devices",
      `Exec=${execPath(command)}`, `TryExec=${command}`, `Icon=${installedIcon}`, "StartupWMClass=eko",
      "Terminal=false", "Categories=AudioVideo;Audio;", marker, "",
    ].join("\n"));
    await rename(temporaryDesktop, desktop);
    await rename(temporaryLink, command);
    if (await readlink(command) !== installed) throw new Error("Installed command does not point at the new build");
    const refresh = spawnSync("update-desktop-database", [dirname(desktop)], { encoding: "utf8" });
    const unavailable = refresh.error && isMissing(refresh.error);
    if (!unavailable && (refresh.error || refresh.status !== 0)) {
      throw new Error(`App installed, but desktop database refresh failed: ${refresh.error?.message ?? refresh.stderr.trim()}`);
    }
    return { binary: installed, installed: command, desktop, sha256, desktopDatabase: unavailable ? "unavailable" : "updated", previousDesktop: previousDesktop === null ? null : join(buildDirectory, "previous.desktop") };
  } finally {
    await rm(temporaryLink, { force: true });
    await rm(temporaryDesktop, { force: true });
  }
}

export async function localDeployOperator(flags: string[]): Promise<Record<string, unknown>> {
  if (flags.some((flag) => !["--help", "--dry-run", "--json"].includes(flag))) throw new Error("Use pnpm ops local:deploy --help for supported options");
  if (flags.includes("--help")) return { environment: "local", help: localDeployHelp };
  if (process.platform !== "linux") throw new Error("Local deployment currently supports Linux. Use the Windows release installer on Windows.");
  const root = resolve(import.meta.dirname, "..");
  const binDirectory = join(homedir(), ".local", "bin");
  const dataDirectory = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  if (!isAbsolute(dataDirectory)) throw new Error("XDG_DATA_HOME must be an absolute path");
  const targetDirectory = process.env.CARGO_TARGET_DIR
    ? resolve(root, "rust", process.env.CARGO_TARGET_DIR) : join(root, "rust", "target");
  const buildArgs = ["exec", "tauri", "build", "--no-bundle", "--ci"];
  const plan = { environment: "local", platform: "linux", build: { command: "pnpm", args: buildArgs }, targetDirectory, installed: join(binDirectory, "eko"), desktop: join(dataDirectory, "applications", "eko.desktop") };
  if (flags.includes("--dry-run")) return { ...plan, dryRun: true };
  const revisionResult = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  if (revisionResult.error || revisionResult.status !== 0) throw new Error("Cannot identify this checkout's Git revision");
  const revision = revisionResult.stdout.trim();
  const dirtyResult = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (dirtyResult.error || dirtyResult.status !== 0) throw new Error("Cannot inspect checkout changes");
  const dirty = dirtyResult.stdout.trim() !== "";
  const env: NodeJS.ProcessEnv = { ...process.env, CARGO_TARGET_DIR: targetDirectory, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || "2" };
  if (!env.RUSTC_WRAPPER && spawnSync("sccache", ["--version"], { stdio: "ignore" }).status === 0) env.RUSTC_WRAPPER = "sccache";
  const started = performance.now();
  console.error("Building the release desktop app and embedded receiver; existing Cargo caches are preserved.");
  const result = spawnSync("pnpm", buildArgs, { cwd: root, env, stdio: ["ignore", 2, 2] });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? `Tauri release build failed (${result.status})`);
  const installed = await installLocalBuild({
    binary: join(targetDirectory, "release", "eko"), icon: join(root, "rust", "icons", "128x128.png"),
    binDirectory, dataDirectory, revision,
  });
  return { ...plan, ...installed, revision, dirty, elapsedSeconds: (performance.now() - started) / 1000, launched: false };
}
