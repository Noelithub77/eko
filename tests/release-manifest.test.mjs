import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseManifest } from "../scripts/finalize-release.mjs";

test("release publication checks all selected assets and combines platform signatures", () => {
  const names = ["eko_0.5.0_x64-setup.exe", "eko_0.5.0_x64-setup.exe.sig", "eko_0.5.0_amd64.AppImage", "eko_0.5.0_amd64.AppImage.sig", "eko-0.5.0-android-aarch64.apk", "eko-0.5.0-android-aarch64.aab"];
  const options = { version: "0.5.0", repository: "example/eko", windows: true, linux: true, apk: true, aab: true, assets: names.map((name) => ({ name, size: 1 })), signature: (name) => name.includes("AppImage") ? "linux-signature" : "windows-signature" };
  const manifest = releaseManifest(options);
  assert.equal(manifest.platforms["windows-x86_64"].signature, "windows-signature");
  assert.equal(manifest.platforms["linux-x86_64"].signature, "linux-signature");
  assert.equal(Object.keys(manifest.platforms).length, 4);
  assert.throws(() => releaseManifest({ ...options, assets: options.assets.slice(0, -1) }), /Missing release asset/);
  assert.throws(() => releaseManifest({ ...options, signature: () => "" }), /Empty updater signature/);
});

test("draft finalization uses a release ID and publishes only after uploading the combined manifest", async () => {
  const { mkdtemp, writeFile, chmod, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "eko-release-fixture-"));
  try {
    const gh = join(directory, "gh");
    await writeFile(gh, `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'release' && args[1] === 'view') process.stdout.write('42');
else if (args[0] === 'api' && args[1].endsWith('/releases/42')) process.stdout.write(JSON.stringify({assets:[{name:'eko_0.5.0_x64-setup.exe',size:1,id:1},{name:'eko_0.5.0_x64-setup.exe.sig',size:1,id:2}]}));
else if (args[0] === 'api' && args[1].endsWith('/assets/2')) process.stdout.write('fixture-signature');
else if (args[0] === 'release' && args[1] === 'upload') {
const manifest=JSON.parse(readFileSync(args[3],'utf8')); if(!manifest.platforms['windows-x86_64']) process.exit(1);
} else if (!(args[0] === 'release' && args[1] === 'edit')) process.exit(1);
`);
    await chmod(gh, 0o755);
    const calls = join(directory, "calls.jsonl");
    const result = spawnSync(process.execPath, [resolve("scripts/finalize-release.mjs")], { encoding: "utf8", env: {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, FIXTURE_CALLS: calls,
      GITHUB_REPOSITORY: "fixture/eko", APP_VERSION: "0.5.0", RELEASE_TAG: "eko-v0.5.0",
      BUILD_WINDOWS: "true", BUILD_LINUX: "false", BUILD_APK: "false", BUILD_AAB: "false",
    } });
    assert.equal(result.status, 0, result.stderr);
    const recorded = (await readFile(calls, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.ok(recorded.some((args) => args[1] === "repos/fixture/eko/releases/42"));
    assert.ok(!recorded.some((args) => args.some((arg) => arg.includes("/releases/tags/"))));
    assert.equal(recorded.at(-1)[1], "edit");
    assert.ok(recorded.at(-1).includes("--draft=false"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
