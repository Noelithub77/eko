import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

function field(value, key) { return value && typeof value === "object" ? value[key] : undefined; }

export async function publishExtension({ mode, token, publisherId, extensionId, archive = "dist/eko-extension.zip" }, request = fetch, wait = delay) {
  if (!["preflight", "publish"].includes(mode)) throw new Error("Mode must be preflight or publish.");
  if (!token || !publisherId || !/^[a-p]{32}$/u.test(extensionId ?? "")) {
    throw new Error("Set ACCESS_TOKEN, CWS_PUBLISHER_ID and eko’s own 32-character CWS_EXTENSION_ID. Create its first listing in the Web Store console.");
  }
  const item = `publishers/${encodeURIComponent(publisherId)}/items/${extensionId}`;
  const base = `https://chromewebstore.googleapis.com/v2/${item}`;
  async function call(url, init = {}) {
    const response = await request(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(120_000) });
    const value = await response.json();
    if (!response.ok) {
      const detail = field(field(value, "error"), "message");
      throw new Error(`Web Store request failed (${response.status}): ${typeof detail === "string" ? detail.slice(0, 400) : "check listing and service-account permissions"}`);
    }
    return value;
  }
  const before = await call(`${base}:fetchStatus`);
  if (field(before, "itemId") !== extensionId) throw new Error("The Web Store returned an unexpected item.");
  if (mode === "preflight") return { mode, item, verified: true };
  const zip = await readFile(archive);
  let uploaded = await call(`https://chromewebstore.googleapis.com/upload/v2/${item}:upload?uploadType=media`, {
    method: "POST", headers: { "Content-Type": "application/zip" }, body: zip,
  });
  let uploadState = field(uploaded, "uploadState");
  for (let attempt = 0; uploadState === "IN_PROGRESS" && attempt < 30; attempt++) {
    await wait(2_000);
    uploaded = await call(`${base}:fetchStatus`);
    uploadState = field(uploaded, "lastAsyncUploadState");
  }
  if (uploadState !== "SUCCEEDED") throw new Error(`Upload did not succeed: ${String(uploadState)}. Nothing was submitted.`);
  const submission = await call(`${base}:publish`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishType: "DEFAULT_PUBLISH", blockOnWarnings: true }),
  });
  const status = await call(`${base}:fetchStatus`);
  return { mode, item, uploadState, submissionState: field(submission, "state"),
    submittedState: field(field(status, "submittedItemRevisionStatus"), "state"),
    publishedState: field(field(status, "publishedItemRevisionStatus"), "state") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await publishExtension({ mode: process.argv[2], token: process.env.ACCESS_TOKEN,
      publisherId: process.env.CWS_PUBLISHER_ID, extensionId: process.env.CWS_EXTENSION_ID });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : "Web Store operation failed."); process.exitCode = 1; }
}
