import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishExtension } from "../../scripts/publish-extension.mjs";

const options = { mode: "publish", token: "fixture", publisherId: "publisher", extensionId: "a".repeat(32) };
test("preflight only reads the selected eko listing", async () => {
  const calls = [];
  const result = await publishExtension({ ...options, mode: "preflight" }, async (url, init) => {
    calls.push({ url, method: init.method });
    return Response.json({ itemId: options.extensionId });
  });
  assert.equal(result.verified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, undefined);
});
test("publishing waits for processing and reads back submitted state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eko-publish-test-"));
  const archive = join(directory, "extension.zip");
  await writeFile(archive, "fixture ZIP");
  const calls = [];
  const responses = [{ itemId: options.extensionId }, { uploadState: "IN_PROGRESS" }, { lastAsyncUploadState: "SUCCEEDED" },
    { state: "PENDING_REVIEW" }, { submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }];
  try {
    const result = await publishExtension({ ...options, archive }, async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return Response.json(responses.shift());
    }, async () => {});
    assert.equal(result.uploadState, "SUCCEEDED");
    assert.equal(result.submittedState, "PENDING_REVIEW");
    assert.equal(result.publishedState, undefined);
    assert.deepEqual(JSON.parse(calls[3].body), { publishType: "DEFAULT_PUBLISH", blockOnWarnings: true });
    assert.equal(calls[4].method, undefined);
  } finally { await rm(directory, { recursive: true }); }
});
test("failed uploads cannot submit a release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eko-publish-test-"));
  const archive = join(directory, "extension.zip");
  await writeFile(archive, "fixture ZIP");
  const responses = [{ itemId: options.extensionId }, { uploadState: "FAILED" }];
  let calls = 0;
  try {
    await assert.rejects(publishExtension({ ...options, archive }, async () => {
      calls++;
      return Response.json(responses.shift());
    }), /Nothing was submitted/u);
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true }); }
});
test("missing eko item ID fails before accessing the Web Store", async () => {
  await assert.rejects(publishExtension({ ...options, extensionId: "" }, async () => { throw new Error("Network should not be called"); }), /first listing/u);
});
