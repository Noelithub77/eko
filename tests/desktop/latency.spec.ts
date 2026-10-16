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

for (const connectionPath of ["relayed", "direct", "local"] as const) {
  test(`desktop shows relay advice only for a relayed connection (${connectionPath})`, async ({ page }) => {
    await page.addInitScript((connectionPath) => {
      let callback = 0;
      const device = (deviceId: string, deviceName: string, connectionPath: string) => ({ deviceId, deviceName, label: null, state: "connected", joinMethod: "qr", connectedAt: "fixture-connection", webRtcState: "connected", iceState: "connected", connectionPath });
      const session = { status: "running", roomId: "fixture-room", token: null, host: "127.0.0.1", port: 44000, devices: [device("web", "Browser phone", connectionPath), device("native", "Native phone", "local")], metrics: [], events: [], lanDiscoveryEnabled: true };
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
    }, connectionPath);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Audio delay for Browser phone" })).toHaveText("~95 ms avg delay");
    await expect(page.getByRole("button", { name: "Audio delay for Native phone" })).toHaveText("~55 ms avg delay");
    await expect(page.getByRole("button", { name: "Direct audio + relay fallback" })).toHaveCount(0);
    const advice = page.getByText("Reduce audio delay", { exact: true });
    if (connectionPath === "relayed") {
      await expect(advice).toBeVisible();
      await expect(page.getByText("This phone is using a relay. Connecting your computer and phone to the same Wi-Fi or a phone hotspot can reduce audio delay.")).toBeVisible();
      await expect(advice).toHaveCount(1);
    } else {
      await expect(advice).toHaveCount(0);
    }
  });
}

test("missing telemetry exits measuring state and explains how to recover", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.evaluate(async (path) => {
    const fixture: unknown = await import(/* @vite-ignore */ path);
    if (typeof fixture === "object" && fixture !== null && "mount" in fixture && typeof fixture.mount === "function") fixture.mount("missing");
  }, `/@fs/${process.cwd()}/tests/desktop/device-delay-fixture.tsx`);
  const trigger = page.getByRole("button", { name: "Audio delay for Test phone" });
  await expect(trigger).toHaveText("Measuring delay…");
  await page.clock.runFor(10_001);
  await expect(trigger).toHaveText("Delay unavailable");
  await trigger.click();
  await expect(page.getByText(/Refresh the listener page and reconnect/)).toBeVisible();
});

test("fresh stats without supported timings show unavailable immediately", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (path) => {
    const fixture: unknown = await import(/* @vite-ignore */ path);
    if (typeof fixture === "object" && fixture !== null && "mount" in fixture && typeof fixture.mount === "function") fixture.mount("unsupported");
  }, `/@fs/${process.cwd()}/tests/desktop/device-delay-fixture.tsx`);
  await expect(page.getByRole("button", { name: "Audio delay for Test phone" })).toHaveText("Delay unavailable");
});
