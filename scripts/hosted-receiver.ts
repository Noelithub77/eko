import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function clientAsset(html: string): string {
  const asset = html.match(/<script\b[^>]*\bsrc="(\/assets\/client-[\w-]+\.js)"/);
  if (!asset?.[1]) throw new Error("Receiver HTML has no versioned client script");
  return asset[1];
}

export async function verifyHostedReceiver(origin: string, directory: string, request: typeof fetch = fetch) {
  const expectedAsset = clientAsset(await readFile(join(directory, "client", "index.html"), "utf8"));
  const response = await request(new URL("/client/", origin), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Receiver HTML HTTP ${response.status}`);
  const actualAsset = clientAsset(await response.text());
  if (actualAsset !== expectedAsset) throw new Error(`Hosted receiver is outdated: expected ${expectedAsset}, served ${actualAsset}`);
  const assetResponse = await request(new URL(actualAsset, origin), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!assetResponse.ok) throw new Error(`Receiver script HTTP ${assetResponse.status}`);
  const expected = await readFile(join(directory, expectedAsset));
  const actual = Buffer.from(await assetResponse.arrayBuffer());
  if (!expected.equals(actual)) throw new Error(`Hosted receiver script does not match the local build: ${actualAsset}`);
  return { asset: actualAsset, sha256: createHash("sha256").update(actual).digest("hex"), bytes: actual.length };
}
