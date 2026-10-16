import { expect, test } from "@playwright/test";

test("listener delay popup shows estimates and usable TURN advice", async ({ page }) => {
  await page.goto("/");
  const modulePath = `/@fs/${process.cwd()}/tests/desktop/device-delay-fixture.tsx`;
  await page.evaluate(async (path) => { const fixture: unknown = await import(/* @vite-ignore */ path); if (typeof fixture === "object" && fixture !== null && "mount" in fixture && typeof fixture.mount === "function") fixture.mount(); else throw new Error("Latency fixture did not export mount"); }, modulePath);
  const trigger = page.getByRole("button", { name: "Audio delay for Test phone" });
  await expect(trigger).toHaveText("~95 ms avg delay");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Relay may add audio delay")).toBeVisible();
  await expect(page.getByText(/same Wi-Fi or one mobile hotspot/)).toBeVisible();
  await expect(page.getByText(/Capture, decoding and speaker or Bluetooth delay are not included/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Relay may add audio delay")).not.toBeVisible();
});

test("desktop polls profiles and shows separate averages for connected devices", async ({ page }) => {
  await page.addInitScript(() => {
    let callback = 0;
    const device = (deviceId: string, deviceName: string, connectionPath: string) => ({ deviceId, deviceName, label: null, state: "connected", joinMethod: "qr", connectedAt: "fixture-connection", webRtcState: "connected", iceState: "connected", connectionPath });
    const session = { status: "running", roomId: "fixture-room", token: null, host: "127.0.0.1", port: 44000, devices: [device("web", "Browser phone", "relayed"), device("native", "Native phone", "local")], metrics: [], events: [], lanDiscoveryEnabled: true };
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {
      metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      transformCallback: () => ++callback,
      unregisterCallback: () => {},
      invoke: async (command: string) => {
        if (command === "start_stream") return { session, qrPayload: { version: 1, local: { host: "127.0.0.1", port: 44000 }, hosted: null } };
        if (command === "get_room_session") return session;
        if (command === "plugin:event|listen") return ++callback;
        if (command === "get_stream_profiler") return ["web", "native"].map((deviceId) => ({ version: 2, source: deviceId === "web" ? "web" : "android", kind: "qualitySample", deviceId, roomId: "fixture-room", connectionId: deviceId, sampleIndex: 1, createdAtMs: Date.now(), latencyMs: deviceId === "web" ? 95 : 55, roundTripMs: 70, bufferMs: deviceId === "web" ? 60 : 20, jitterMs: 5, packetLossPercent: 0, packetsReceived: 100, packetsLost: 0 }));
        return null;
      },
    } });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", { value: { unregisterListener: () => {} } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Audio delay for Browser phone" })).toHaveText("~95 ms avg delay");
  await expect(page.getByRole("button", { name: "Audio delay for Native phone" })).toHaveText("~55 ms avg delay");
  await page.getByRole("button", { name: "Direct audio + relay fallback" }).click();
  await expect(page.getByText("A shorter path for audio")).toBeVisible();
  await expect(page.getByText(/one mobile hotspot. Check the average delay/)).toBeVisible();
});
