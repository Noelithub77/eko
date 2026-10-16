import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 900, height: 600 }, { width: 1280, height: 800 }, { width: 2000, height: 1000 }]) {
  test(`centers playback and pairing at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      let callback = 0;
      const session = { status: "running", roomId: "fixture", host: "192.168.1.20", port: 44000, devices: [], metrics: [], events: [] };
      const qrPayload = { version: 1, local: { host: "192.168.1.20", port: 44000 }, hosted: { roomId: "fixture", joinToken: "fixture", socketUrl: "wss://eko.allpyq.in/v1/rooms/fixture/socket", clientUrl: "https://eko.allpyq.in/client/" } };
      Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
        transformCallback: () => ++callback,
        unregisterCallback: () => {},
        invoke: async (command: string) => {
          if (command === "start_stream") return { session, qrPayload };
          if (command === "get_room_session") return session;
          if (command === "media_get_state") return { title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming", isPlaying: true, positionMs: 95000, durationMs: 243000, appName: "Spotify" };
          if (command === "plugin:event|listen") return ++callback;
          return null;
        },
      } });
      Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", { value: { unregisterListener: () => {} } });
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Midnight City" })).toBeVisible();
    await expect(page.getByRole("img", { name: "eko pairing QR code" }).locator("canvas")).toBeVisible();
    const layout = await page.evaluate(() => {
      const player = document.querySelector(".desktop-player")?.getBoundingClientRect();
      const pairing = document.querySelector(".desktop-pairing")?.getBoundingClientRect();
      const main = document.querySelector("main")?.getBoundingClientRect();
      if (!player || !pairing || !main) throw new Error("Missing layout");
      return {
        centers: [player.y + player.height / 2, pairing.y + pairing.height / 2],
        gap: pairing.left - player.right,
        fits: player.top >= main.top && pairing.top >= main.top && player.bottom <= main.bottom && pairing.bottom <= main.bottom,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(Math.abs(layout.centers[0] - layout.centers[1])).toBeLessThan(2);
    expect(layout.gap).toBeGreaterThanOrEqual(32);
    expect(layout.fits).toBe(true);
    expect(layout.horizontalOverflow).toBe(false);
    await page.screenshot({ path: `test-results/desktop-layout-${viewport.width}.png` });
  });
}
