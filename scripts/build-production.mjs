import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const rootPath = resolve(import.meta.dirname, "..");
const releasePath = join(rootPath, "releases");

const desktopExePath = join(rootPath, "rust", "target", "release", "eko.exe");
const androidOutputPath = join(
  rootPath,
  "rust",
  "gen",
  "android",
  "app",
  "build",
  "outputs",
  "apk",
);

const releaseFiles = {
  desktop: join(releasePath, "eko-windows.exe"),
  android: join(releasePath, "eko-android-arm64.apk"),
};

await runCommand("npm", ["run", "build:production:desktop"]);
await runCommand("npm", ["run", "build:production:android"]);

await mkdir(releasePath, { recursive: true });
await copyFile(desktopExePath, releaseFiles.desktop);

const androidApkPath = await findNewestApk(androidOutputPath);
await copyFile(androidApkPath, releaseFiles.android);

console.log("");
console.log("Production files copied:");
console.log(`- ${releaseFiles.desktop}`);
console.log(`- ${releaseFiles.android}`);
console.log(`Android source APK: ${androidApkPath}`);

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const commandParts = getCommandParts(command, args);
    const child = spawn(commandParts.command, commandParts.args, {
      cwd: rootPath,
      stdio: "inherit",
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function getCommandParts(command, args) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
    };
  }

  return { command, args };
}

async function findNewestApk(folderPath) {
  const files = await findFiles(folderPath);
  const apkFiles = files.filter((filePath) => filePath.endsWith(".apk"));

  if (apkFiles.length === 0) {
    throw new Error(`No APK files found in ${folderPath}`);
  }

  const apkDetails = await Promise.all(
    apkFiles.map(async (filePath) => ({
      filePath,
      updatedAt: (await stat(filePath)).mtimeMs,
    })),
  );

  apkDetails.sort((first, second) => second.updatedAt - first.updatedAt);

  const newestApk = apkDetails[0]?.filePath;
  if (!newestApk) {
    throw new Error("Could not pick the newest APK.");
  }

  console.log(`Picked Android APK: ${basename(newestApk)}`);
  return newestApk;
}

async function findFiles(folderPath) {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(folderPath, entry.name);

      if (entry.isDirectory()) {
        return findFiles(entryPath);
      }

      return [entryPath];
    }),
  );

  return files.flat();
}
