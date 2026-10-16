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
