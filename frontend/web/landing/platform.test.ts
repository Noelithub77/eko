import assert from "node:assert/strict";
import test from "node:test";
import { version } from "../../../package.json";
import { defaultPlatform, detectDevice, downloadUrl } from "./platform.ts";

test("detects devices from platform strings and user agents", () => {
  assert.equal(detectDevice("Linux armv8l", "Mozilla/5.0 (Linux; Android 15; Pixel 8)"), "android");
  assert.equal(detectDevice("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "ios");
  assert.equal(detectDevice("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)", 5), "ios");
  assert.equal(detectDevice("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)"), "macos");
  assert.equal(detectDevice("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.equal(detectDevice("Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)"), "linux");
  assert.equal(detectDevice("", ""), null);
});

test("devices without a build start on Windows", () => {
  assert.equal(defaultPlatform("macos"), "windows");
  assert.equal(defaultPlatform("ios"), "windows");
  assert.equal(defaultPlatform("linux"), "linux");
});

test("download links point at the release for the app version", () => {
  assert.equal(
    downloadUrl("linux"),
    `https://github.com/Noelithub77/eko/releases/download/eko-v${version}/eko_${version}_amd64.AppImage`,
  );
});
