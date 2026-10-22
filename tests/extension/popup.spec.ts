import { expect, test } from "@playwright/test";

test("real browser peers enforce approval, ignore duplicate ready and cancel revoked offers", async ({ page }) => {
  await page.goto("/popup.html");
  await page.addScriptTag({ type: "module", url: `/@fs${new URL("peer-fixture.ts", import.meta.url).pathname}` });
  await expect(page.locator("body")).toHaveAttribute("data-peer-test", "passed");
});

test("shares a tab, requires approval and keeps secondary controls closed", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.addInitScript(() => {
    const devices = [{ deviceId: "phone", deviceName: "Noel’s phone", label: null, state: "pending", joinMethod: "qr",
      connectedAt: null, webRtcState: "new", iceState: "new", connectionPath: null }];
    const state = { status: "idle", tabId: 1, tabTitle: "A quiet afternoon", devices: [], muteLocal: false, error: null, warning: null, pairing: null };
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: { getURL: (path: string) => `/${path}`, onMessage: { addListener() {}, removeListener() {} },
        sendMessage: async ({ command }: { command: { type: string; deviceId?: string; muted?: boolean; source?: string } }) => {
          if (command.type === "start") document.body.dataset.startSource = command.source;
          if (command.type === "start") Object.assign(state, { status: "streaming", devices,
            pairing: { version: 1, local: { host: "localhost", port: 4040 }, hosted: { roomId: "fixture-room", joinToken: "fixture-token",
              clientUrl: "https://eko.allpyq.in/client/", socketUrl: "wss://eko.allpyq.in/v1/rooms/fixture-room/socket" } } });
          if (command.type === "allow") devices[0].state = "connected";
          if (command.type === "stop") Object.assign(state, { status: "idle", pairing: null, devices: [] });
          if (command.type === "mute") state.muteLocal = command.muted ?? false;
          return { ok: true, state };
        } }, tabs: { query: async () => [{ id: 1, title: "A quiet afternoon" }], create: async () => ({}) },
    } });
  });
  await page.goto("/popup.html");
  await expect(page.getByRole("heading", { name: "Share this tab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Light theme", exact: true })).toHaveCount(0);
  await page.screenshot({ path: ".test-results/extension/idle.png" });
  await page.getByRole("button", { name: "Choose what to share" }).click();
  await expect(page.getByRole("menuitemradio", { name: "This tab" })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: ".test-results/extension/sources.png" });
  await page.getByRole("menuitemradio", { name: "System audio" }).click();
  await expect(page.getByRole("heading", { name: "Share system audio" })).toBeVisible();
  await page.getByRole("button", { name: "Choose what to share" }).click();
  await page.getByRole("menuitemradio", { name: "This tab" }).click();
  await page.getByRole("button", { name: "Start sharing" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-start-source", "tab");
  await expect(page.getByRole("heading", { name: "Scan to listen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(page.getByText("Wants to listen")).toBeVisible();
  await expect(page.getByText(/No app required|APK compatible|Encrypted WebRTC/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toBeVisible();
  await page.screenshot({ path: ".test-results/extension/pending-light.png" });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Light theme", exact: true })).toBeHidden();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.screenshot({ path: ".test-results/extension/pending-dark.png" });
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share this tab" })).toBeVisible();
  expect(failures).toEqual([]);
});
