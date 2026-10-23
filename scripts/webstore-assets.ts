import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { mkdir, readFile, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { initialSnapshot, type HostSnapshot } from "../extension/runtime/messages";

const root = fileURLToPath(new URL("..", import.meta.url));
const destination = join(root, "docs/chrome-web-store/assets");

async function dataUrl(path: string, mime: string): Promise<string> {
  return `data:${mime};base64,${(await readFile(join(root, path))).toString("base64")}`;
}

async function capturePopup(page: Page, origin: string, state: HostSnapshot, dark: boolean, settings = false) {
  page.on("pageerror", error => console.error(error.message));
  // A source string avoids tsx's function-name helpers in the browser preload.
  await page.addInitScript({ content: `
    const snapshot = ${JSON.stringify(state)};
    localStorage.setItem("eko-extension-theme", ${JSON.stringify(dark ? "dark" : "light")});
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: {
        getURL: path => "/" + path,
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage: async () => ({ ok: true, state: snapshot }),
      },
      tabs: { query: async () => [{ id: 1, title: snapshot.tabTitle }], create: async () => ({}) },
    } });
  ` });
  await page.goto(`${origin}/popup.html`);
  try {
    await expect(page.getByText(state.status === "idle" ? "Ready" : "Live", { exact: true })).toBeVisible();
  } catch (error) {
    console.error(await page.locator("body").innerText());
    throw error;
  }
  await page.evaluate(() => document.fonts.ready);
  if (state.pairing) await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  if (settings) await page.getByRole("button", { name: "Settings", exact: true }).click();
  return (await page.screenshot({ animations: "disabled" })).toString("base64");
}

export async function buildWebStoreAssets() {
  await mkdir(destination, { recursive: true });
  process.env.PLATFORM = "extension";
  const server = await createServer({ configFile: join(root, "vite.config.ts"), server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (!origin) { await server.close(); throw new Error("Asset preview server did not expose a local URL"); }
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "chromium", executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const font = await dataUrl("frontend/web/public/fonts/nunito-bold.woff2", "font/woff2");
    const icon = await dataUrl("frontend/shared/assets/eko.svg", "image/svg+xml");
    const state: HostSnapshot = {
      ...initialSnapshot, tabId: 1, tabTitle: "A quiet afternoon", status: "streaming",
      pairing: { version: 1, local: { host: "localhost", port: 4040 }, hosted: {
        roomId: "store-preview", joinToken: "sample-not-a-live-session", clientUrl: "https://eko.allpyq.in/client/",
        socketUrl: "wss://eko.allpyq.in/v1/rooms/store-preview/socket",
      } },
      devices: [{ deviceId: "sample-phone", deviceName: "Phone", label: null, state: "pending", joinMethod: "qr",
        connectedAt: null, webRtcState: "new", iceState: "new", connectionPath: null }],
    };
    const scenes = [
      { file: "01-share.png", title: "Share the tab.<br>Keep listening.", detail: "Start with the tab you choose.",
        label: "Tab audio", dark: false, state: { ...initialSnapshot, tabId: 1, tabTitle: state.tabTitle } },
      { file: "02-approve.png", title: "Choose who<br>gets to listen.", detail: "Scan the code. Approve each listener.",
        label: "You're in control", dark: true, state },
      { file: "03-controls.png", title: "Your audio.<br>Your controls.", detail: "Mute your computer or stop sharing.",
        label: "A quieter setup", dark: false, settings: true,
        state: { ...state, devices: state.devices.map(device => ({ ...device, state: "connected" as const })) } },
    ];
    const files: { file: string; width: number; height: number; bytes: number }[] = [];
    for (const scene of scenes) {
      const context = await browser.newContext({ viewport: { width: 420, height: 600 }, deviceScaleFactor: 1 });
      const popup = await context.newPage();
      const screenshot = await capturePopup(popup, origin, scene.state, scene.dark, scene.settings);
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
        @font-face{font-family:Nunito;src:url('${font}')}*{box-sizing:border-box}body{margin:0;background:${scene.dark ? "#101010" : "#f5f1eb"};color:${scene.dark ? "#f5f1eb" : "#101010"};font-family:Nunito,sans-serif}
        main{width:1280px;height:800px;display:flex;align-items:center;padding:80px 100px;gap:80px}.copy{flex:1;min-width:0}.brand{display:flex;align-items:center;gap:14px;font-size:32px;margin-bottom:70px}.brand img{width:48px;height:48px;border-radius:12px}
        .label{font-size:18px;color:${scene.dark ? "#76dbd0" : "#247c74"};margin:0 0 18px}h1{font-size:61px;line-height:1.08;letter-spacing:-2px;margin:0 0 28px}.detail{font-size:22px;line-height:1.5;margin:0;max-width:400px;color:${scene.dark ? "#bbb8b4" : "#65615c"}}
        .popup{display:block;width:420px;height:600px;border-radius:20px;box-shadow:0 20px 70px #0002;outline:1px solid ${scene.dark ? "#ffffff20" : "#0000000c"}}
        </style></head><body><main><div class="copy"><div class="brand"><img src="${icon}" alt="">eko</div><p class="label">${scene.label}</p><h1>${scene.title}</h1><p class="detail">${scene.detail}</p></div><img class="popup" src="data:image/png;base64,${screenshot}" alt="eko extension popup"></main></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(destination, scene.file), animations: "disabled" });
      files.push({ file: scene.file, width: 1280, height: 800, bytes: (await stat(join(destination, scene.file))).size });
      await context.close();
    }
    for (const promo of [{ file: "promo-small.png", width: 440, height: 280, size: 84 }, { file: "promo-marquee.png", width: 1400, height: 560, size: 180 }]) {
      const page = await browser.newPage({ viewport: { width: promo.width, height: promo.height }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html lang="en"><head><style>@font-face{font-family:Nunito;src:url('${font}')}body{margin:0;background:#101010;display:flex;align-items:center;justify-content:center;height:100vh;color:#f7f4ef;gap:${promo.size * .22}px;font:${promo.size}px Nunito,sans-serif;letter-spacing:-${promo.size * .04}px}img{width:${promo.size * 1.25}px;height:${promo.size * 1.25}px}</style></head><body><img src="${icon}" alt="">eko</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(destination, promo.file) });
      files.push({ file: promo.file, width: promo.width, height: promo.height, bytes: (await stat(join(destination, promo.file))).size });
      await page.close();
    }
    await copyFile(join(root, "extension/public/icons/128.png"), join(destination, "icon-128.png"));
    files.push({ file: "icon-128.png", width: 128, height: 128, bytes: (await stat(join(destination, "icon-128.png"))).size });
    return { environment: "local", directory: "docs/chrome-web-store/assets", files, evidence: "Rendered actual popup components with sample session data; no live capture or device playback" };
  } finally {
    await browser?.close();
    await server.close();
  }
}
