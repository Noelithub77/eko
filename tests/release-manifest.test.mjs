import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { releaseManifest, releaseNotes } from "../scripts/finalize-release.mjs";

const version = "0.5.0";
const repository = "fixture/eko";
const dmg = `eko_${version}_aarch64.dmg`;
const desktopNames = [`eko_${version}_x64-setup.exe`, `eko_${version}_x64-setup.exe.sig`, `eko_${version}_amd64.AppImage`, `eko_${version}_amd64.AppImage.sig`];
const assets = (names) => names.map((name, index) => ({ name, size: 1, id: index + 1 }));
const options = { version, repository, signature: (name) => name.includes("AppImage") ? "linux-signature" : "windows-signature" };

test("release publication checks all selected assets and combines platform signatures", () => {
  const names = [...desktopNames, `eko-${version}-android-aarch64.apk`, `eko-${version}-android-aarch64.aab`, dmg];
  const selected = { ...options, windows: true, linux: true, macos: true, apk: true, aab: true, assets: assets(names) };
  const manifest = releaseManifest(selected);
  assert.equal(manifest.platforms["windows-x86_64"].signature, "windows-signature");
  assert.equal(manifest.platforms["linux-x86_64"].signature, "linux-signature");
  assert.deepEqual(Object.keys(manifest.platforms), ["windows-x86_64", "windows-x86_64-nsis", "linux-x86_64", "linux-x86_64-appimage"]);
  assert.throws(() => releaseManifest({ ...selected, assets: selected.assets.filter((asset) => !asset.name.endsWith(".aab")) }), /Missing release asset/);
  assert.throws(() => releaseManifest({ ...selected, signature: () => "" }), /Empty updater signature/);
});

test("macOS needs a nonempty DMG, with no signature or updater target", () => {
  const selected = { ...options, macos: true, signature: () => assert.fail("macOS must not fetch signatures") };
  assert.throws(() => releaseManifest({ ...selected, assets: [] }), /Missing release asset: eko_0.5.0_aarch64.dmg/);
  assert.throws(() => releaseManifest({ ...selected, assets: [{ name: dmg, size: 0 }] }), /Missing release asset/);
  assert.deepEqual(releaseManifest({ ...selected, assets: assets([dmg]) }).platforms, {});
  for (const macos of [undefined, false]) {
    assert.deepEqual(releaseManifest({ ...selected, macos, assets: [] }).platforms, {});
  }
});

test("release notes label only the macOS download beta and preserve existing text on retries", () => {
  const body = "Audio fixes.\n\n- Windows and Linux downloads\n";
  const notes = releaseNotes({ body, macos: true, version, repository });
  assert.ok(notes.startsWith(body));
  assert.ok(notes.includes(`[macOS beta (Apple Silicon)](https://github.com/${repository}/releases/download/eko-v${version}/${dmg})`));
  assert.equal(releaseNotes({ body: notes, macos: true, version, repository }), notes);
  assert.ok(releaseNotes({ body: "", macos: true, version, repository }).startsWith("- [macOS beta"));
  for (const macos of [undefined, false]) assert.equal(releaseNotes({ body, macos, version, repository }), body);
});

async function finalize({ names = [], releaseAssets = assets(names), body = "Existing release notes.", builds = {}, fail = "" }) {
  const directory = await mkdtemp(join(tmpdir(), "eko-release-fixture-"));
  try {
    const gh = join(directory, "gh");
    await writeFile(gh, `#!/usr/bin/env node
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'release' && args[1] === 'view') process.stdout.write('42');
else if (args[0] === 'api' && args[1].endsWith('/releases/42')) process.stdout.write(process.env.FIXTURE_RELEASE);
else if (args[0] === 'api' && args[1].includes('/releases/assets/')) process.stdout.write('fixture-signature');
else if (args[0] === 'release' && args[1] === 'upload') {
  if (process.env.FIXTURE_FAIL === 'upload') process.exit(1);
  writeFileSync(process.env.FIXTURE_MANIFEST, readFileSync(args[3]));
} else if (args[0] === 'release' && args[1] === 'edit' && args[3] === '--notes-file') {
  if (process.env.FIXTURE_FAIL === 'notes') process.exit(1);
  writeFileSync(process.env.FIXTURE_NOTES, readFileSync(args[4]));
} else if (!(args[0] === 'release' && args[1] === 'edit' && args.includes('--draft=false'))) process.exit(1);
`);
    await chmod(gh, 0o755);
    const callsPath = join(directory, "calls.jsonl");
    const manifestPath = join(directory, "manifest.json");
    const notesPath = join(directory, "notes.md");
    const env = {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, FIXTURE_CALLS: callsPath,
      FIXTURE_RELEASE: JSON.stringify({ assets: releaseAssets, body }), FIXTURE_FAIL: fail,
      FIXTURE_MANIFEST: manifestPath, FIXTURE_NOTES: notesPath,
      GITHUB_REPOSITORY: repository, APP_VERSION: version, RELEASE_TAG: `eko-v${version}`,
      BUILD_WINDOWS: "false", BUILD_LINUX: "false", BUILD_APK: "false", BUILD_AAB: "false", ...builds,
    };
    if (!Object.hasOwn(builds, "BUILD_MACOS")) delete env.BUILD_MACOS;
    const result = spawnSync(process.execPath, [resolve("scripts/finalize-release.mjs")], { encoding: "utf8", env });
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    for (const args of calls) {
      if (args[1] === "upload") assert.ok(!existsSync(args[3]), "temporary manifest must be removed");
      if (args.includes("--notes-file")) assert.ok(!existsSync(args[4]), "temporary notes must be removed");
    }
    return { result, calls,
      manifest: existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : undefined,
      notes: existsSync(notesPath) ? await readFile(notesPath, "utf8") : undefined,
    };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

function assertPublished({ result, calls }) {
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.some((args) => args[1] === `repos/${repository}/releases/42`));
  assert.ok(!calls.some((args) => args.some((arg) => arg.includes("/releases/tags/"))));
  assert.deepEqual(calls.at(-1), ["release", "edit", `eko-v${version}`, "--draft=false", "--latest"]);
  assert.ok(!calls.some((args) => args.some((arg) => arg.includes("--prerelease"))));
}

test("legacy Windows finalization publishes after manifest upload with macOS false or omitted", async () => {
  for (const macos of [undefined, "false"]) {
    const builds = { BUILD_WINDOWS: "true" };
    if (macos !== undefined) builds.BUILD_MACOS = macos;
    const run = await finalize({ names: desktopNames.slice(0, 2), builds });
    assertPublished(run);
    assert.ok(run.manifest.platforms["windows-x86_64"]);
    assert.equal(run.calls.at(-2)[1], "upload");
    assert.equal(run.notes, undefined);
  }
});

test("macOS-only finalization writes beta notes before publication without an updater manifest", async () => {
  const run = await finalize({ names: [dmg], builds: { BUILD_MACOS: "true" }, body: null });
  assertPublished(run);
  assert.equal(run.manifest, undefined);
  assert.ok(run.notes.includes("macOS beta (Apple Silicon)"));
  assert.equal(run.calls.at(-2)[3], "--notes-file");
  assert.ok(!run.calls.some((args) => args[1].includes("/releases/assets/")));
});

test("mixed finalization uploads signed updater targets and preserves notes before publication", async () => {
  const body = "Existing notes with fixes.\n";
  const run = await finalize({ names: [...desktopNames, dmg], body, builds: { BUILD_WINDOWS: "true", BUILD_LINUX: "true", BUILD_MACOS: "true" } });
  assertPublished(run);
  assert.equal(Object.keys(run.manifest.platforms).length, 4);
  assert.ok(!Object.keys(run.manifest.platforms).some((key) => key.startsWith("darwin")));
  assert.ok(run.notes.startsWith(body));
  assert.equal(run.calls.at(-3)[1], "upload");
  assert.equal(run.calls.at(-2)[3], "--notes-file");
});

test("retrying macOS finalization does not duplicate or rewrite existing beta notes", async () => {
  const body = releaseNotes({ body: "Existing notes.", macos: true, version, repository });
  const run = await finalize({ names: [dmg], body, builds: { BUILD_MACOS: "true" } });
  assertPublished(run);
  assert.equal(run.notes, undefined);
  assert.ok(!run.calls.some((args) => args.includes("--notes-file")));
});

test("missing or empty selected macOS assets prevent notes, manifest upload and publication", async () => {
  for (const releaseAssets of [assets(desktopNames), [...assets(desktopNames), { name: dmg, size: 0 }]]) {
    const run = await finalize({ releaseAssets, builds: { BUILD_WINDOWS: "true", BUILD_LINUX: "true", BUILD_MACOS: "true" } });
    assert.notEqual(run.result.status, 0);
    assert.match(run.result.stderr, /Missing release asset: eko_0.5.0_aarch64.dmg/);
    assert.ok(!run.calls.some((args) => args[0] === "release" && ["edit", "upload"].includes(args[1])));
  }
});

test("manifest upload or beta note update failure prevents publication and cleans temporary files", async () => {
  for (const fail of ["upload", "notes"]) {
    const run = await finalize({ names: [...desktopNames, dmg], builds: { BUILD_WINDOWS: "true", BUILD_LINUX: "true", BUILD_MACOS: "true" }, fail });
    assert.notEqual(run.result.status, 0);
    assert.ok(!run.calls.some((args) => args.includes("--draft=false")));
    if (fail === "upload") assert.ok(!run.calls.some((args) => args.includes("--notes-file")));
  }
});
