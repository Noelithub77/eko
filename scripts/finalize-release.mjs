import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function releaseManifest({ version, repository, windows, linux, macos, apk, aab, assets, signature, now = new Date() }) {
  const required = [];
  const platforms = {};
  const addDesktop = (file, keys) => {
    required.push(file, `${file}.sig`);
    const value = signature(`${file}.sig`).trim();
    if (!value) throw new Error(`Empty updater signature for ${file}`);
    for (const key of keys) platforms[key] = { signature: value, url: `https://github.com/${repository}/releases/download/eko-v${version}/${file}` };
  };
  if (windows) addDesktop(`eko_${version}_x64-setup.exe`, ["windows-x86_64", "windows-x86_64-nsis"]);
  if (linux) addDesktop(`eko_${version}_amd64.AppImage`, ["linux-x86_64", "linux-x86_64-appimage"]);
  if (macos) required.push(`eko_${version}_aarch64.dmg`);
  if (apk) required.push(`eko-${version}-android-aarch64.apk`);
  if (aab) required.push(`eko-${version}-android-aarch64.aab`);
  for (const file of required) {
    if (!assets.some((asset) => asset.name === file && asset.size > 0)) throw new Error(`Missing release asset: ${file}`);
  }
  return { version, notes: "", pub_date: now.toISOString(), platforms };
}

export function releaseNotes({ body, macos, version, repository }) {
  if (!macos) return body;
  const note = `- [macOS beta (Apple Silicon)](https://github.com/${repository}/releases/download/eko-v${version}/eko_${version}_aarch64.dmg)`;
  if (body.includes(note)) return body;
  return `${body}${body ? "\n\n" : ""}${note}\n`;
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const version = process.env.APP_VERSION;
  const tag = process.env.RELEASE_TAG;
  if (!repository || !version || tag !== `eko-v${version}`) throw new Error("Expected repository, app version and matching release tag");
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
  const releaseId = gh(["release", "view", tag, "--json", "databaseId", "--jq", ".databaseId"]);
  if (!/^\d+$/.test(releaseId)) throw new Error("Release has no numeric database ID");
  const release = JSON.parse(gh(["api", `repos/${repository}/releases/${releaseId}`]));
  if (!Array.isArray(release.assets)) throw new Error("Release has no asset list");
  const macos = process.env.BUILD_MACOS === "true";
  const manifest = releaseManifest({ version, repository,
    windows: process.env.BUILD_WINDOWS === "true", linux: process.env.BUILD_LINUX === "true",
    macos,
    apk: process.env.BUILD_APK === "true", aab: process.env.BUILD_AAB === "true", assets: release.assets,
    signature: (name) => {
      const asset = release.assets.find((asset) => asset.name === name && typeof asset.id === "number");
      if (!asset) throw new Error(`Missing updater signature: ${name}`);
      return gh(["api", `repos/${repository}/releases/assets/${asset.id}`, "--header", "Accept: application/octet-stream"]);
    },
  });
  const directory = mkdtempSync(join(tmpdir(), "eko-release-"));
  try {
    if (Object.keys(manifest.platforms).length) {
      const path = join(directory, "latest.json");
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      gh(["release", "upload", tag, path, "--clobber"]);
    }
    if (macos) {
      const body = release.body ?? "";
      const notes = releaseNotes({ body, macos, version, repository });
      if (notes !== body) {
        const path = join(directory, "notes.md");
        writeFileSync(path, notes);
        gh(["release", "edit", tag, "--notes-file", path]);
      }
    }
    gh(["release", "edit", tag, "--draft=false", "--latest"]);
    console.log(JSON.stringify({ tag, published: true, platforms: Object.keys(manifest.platforms) }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
