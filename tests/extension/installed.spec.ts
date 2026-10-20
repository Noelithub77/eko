import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

test("the built extension loads its module worker, popup and offscreen host", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eko-extension-browser-"));
  const extension = resolve("dist/extension");
  const context = await chromium.launchPersistentContext(directory, {
    headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 420, height: 600 },
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).hostname;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole("button", { name: "Start sharing" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const response: unknown = await page.evaluate(async () => chrome.runtime.sendMessage({ target: "background", command: { type: "getState" } }));
    expect(response).toMatchObject({ ok: true, state: { status: "idle", devices: [] } });
    const offscreen = await worker.evaluate(async () => chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }));
    expect(offscreen).toHaveLength(1);
    expect(offscreen[0].documentUrl).toContain("/offscreen.html");
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
});
