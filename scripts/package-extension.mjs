import { readdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import { resolve, join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(root, "dist/extension");
const archive = join(root, "dist/eko-extension.zip");
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
const required = [manifest.action.default_popup, manifest.background.service_worker, "offscreen.html", "receiver.html", ...Object.values(manifest.icons)];
for (const file of required) {
  if (typeof file !== "string" || !(await stat(join(directory, file))).isFile()) throw new Error(`Missing extension asset: ${file}`);
}
async function list(relative = "") {
  const entries = await readdir(join(directory, relative), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const file = join(relative, entry.name);
    if (entry.isDirectory()) return list(file);
    if (!entry.isFile() || file.endsWith(".map")) throw new Error(`Unexpected bundle entry: ${file}`);
    return file;
  }));
  return files.flat().sort();
}
const files = await list();
for (const file of files.filter((file) => /\.(html|css|js)$/u.test(file))) {
  const text = await readFile(join(directory, file), "utf8");
  // Verify build-generated local references; network endpoints in JS are not executable assets.
  const references = file.endsWith(".html") ? [...text.matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1])
    : file.endsWith(".css") ? [...text.matchAll(/url\(["']?([^)'"\s]+)["']?\)/gu)].map((match) => match[1]) : [];
  for (const reference of references) {
    if (reference.startsWith("data:") || reference.startsWith("#")) continue;
    if (/^https?:/u.test(reference)) throw new Error(`Remote asset in ${file}`);
    const target = resolve(directory, dirname(file), reference.split("?")[0]);
    if (!target.startsWith(directory + sep) || !(await stat(target)).isFile()) throw new Error(`Missing asset in ${file}: ${reference}`);
  }
}
await rm(archive, { force: true });
const zipped = spawnSync("zip", ["-X", "-q", archive, ...files], { cwd: directory, stdio: "inherit" });
if (zipped.error || zipped.status !== 0) throw new Error(zipped.error?.message ?? "Could not package extension; install the zip CLI.");
const bytes = await readFile(archive);
const sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile(`${archive}.sha256`, `${sha256}  eko-extension.zip\n`);
const result = { archive: "dist/eko-extension.zip", unpacked: "dist/extension", version: manifest.version, files: files.length, bytes: bytes.length, sha256 };
await writeFile(join(root, "dist/extension-bundle.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
