// Renders every blog/excali/*.excalidraw to a PNG in blog/images/ using headless Chromium.
// A drawing with frames exports one PNG per frame, named after the frame.
// Usage: node blog/scripts/export-diagrams.mjs [name-filter]
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const blogDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(blogDir, "excali");
const outDir = join(blogDir, "images");
const filter = process.argv[2] ?? "";
const excalidrawVersion = "0.18.0";

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const files = (await readdir(sourceDir)).filter((f) => f.endsWith(".excalidraw") && f.includes(filter)).sort();
if (files.length === 0) {
  console.error(`No .excalidraw files in ${sourceDir} match "${filter}".`);
  process.exit(1);
}
await mkdir(outDir, { recursive: true });

// Prefer CHROME_PATH or a system Chromium so no Playwright browser download is needed.
const systemChrome = ["/usr/bin/chromium", "/usr/bin/google-chrome-stable", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? systemChrome });
const page = await browser.newPage();
await page.setContent(`<html><body><script type="module">
  window.EXCALIDRAW_ASSET_PATH = "https://esm.sh/@excalidraw/excalidraw@${excalidrawVersion}/dist/prod/";
  const lib = await import("https://esm.sh/@excalidraw/excalidraw@${excalidrawVersion}?bundle-deps");
  window.renderPng = async (scene, frameId) => {
    const elements = scene.elements.filter((e) => !e.isDeleted);
    const exportingFrame = frameId ? elements.find((e) => e.id === frameId) : null;
    const blob = await lib.exportToBlob({
      elements,
      files: scene.files ?? {},
      exportingFrame,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false, exportEmbedScene: false },
      exportPadding: 32,
      getDimensions: (width, height) => ({ width: width * 2, height: height * 2, scale: 2 }),
      mimeType: "image/png",
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  };
  window.ready = true;
</script></body></html>`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });

for (const file of files) {
  const scene = JSON.parse(await readFile(join(sourceDir, file), "utf8"));
  const frames = scene.elements.filter((e) => e.type === "frame" && !e.isDeleted);
  const targets = frames.length > 0
    ? frames.map((f) => ({ id: f.id, name: `${basename(file, ".excalidraw")}-${slug(f.name ?? f.id)}` }))
    : [{ id: null, name: basename(file, ".excalidraw") }];
  for (const target of targets) {
    const png = await page.evaluate(([s, id]) => window.renderPng(s, id), [scene, target.id]);
    const outPath = join(outDir, `${target.name}.png`);
    await writeFile(outPath, Buffer.from(png, "base64"));
    console.log(`wrote ${outPath}`);
  }
}
await browser.close();
