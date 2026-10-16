import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyHostedReceiver } from "../../scripts/hosted-receiver.ts";

test("hosted receiver verification rejects stale HTML and changed script bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eko-receiver-test-"));
  try {
    await mkdir(join(directory, "client"));
    await mkdir(join(directory, "assets"));
    const html = '<script type="module" src="/assets/client-current.js"></script>';
    await writeFile(join(directory, "client", "index.html"), html);
    await writeFile(join(directory, "assets", "client-current.js"), "current receiver");
    const stale: typeof fetch = async () => new Response('<script src="/assets/client-old.js"></script>');
    await assert.rejects(verifyHostedReceiver("https://example.test", directory, stale), /outdated/);
    const altered: typeof fetch = async (input) => new Response(String(input).endsWith("/client/") ? html : "old receiver");
    await assert.rejects(verifyHostedReceiver("https://example.test", directory, altered), /does not match/);
    const current: typeof fetch = async (input) => new Response(String(input).endsWith("/client/") ? html : "current receiver");
    const result = await verifyHostedReceiver("https://example.test", directory, current);
    assert.equal(result.asset, "/assets/client-current.js");
    assert.equal(result.sha256.length, 64);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
