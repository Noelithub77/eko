import { expect, test, type Page } from "@playwright/test";

async function mount(page: Page, mode: "hook" | "app" = "hook") {
  const payload = mode === "app" ? `#payload=${Buffer.from(JSON.stringify({ version: 1, local: { host: "127.0.0.1", port: 44009 } })).toString("base64url")}` : "";
  await page.goto(`/@fs/${process.cwd()}/tests/desktop/playback-fixture.html?mode=${mode}${payload}`);
}

test("hidden playback, interruptions and user pause use separate intent", async ({ page }) => {
  await page.clock.install();
  await mount(page);
  await expect(page.locator("output")).toContainText('"playing":true');
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(5_000);
  await expect(page.locator("output")).toContainText('"plays":0');
  await expect(page.locator("output")).toContainText('"playing":true');
  await page.getByText("Simulate interruption").click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("output")).toContainText('"plays":1');
  await page.getByText("User pause", { exact: true }).click();
  await page.evaluate(() => {
    document.dispatchEvent(new Event("resume"));
    window.dispatchEvent(new Event("pageshow"));
  });
  await page.clock.runFor(15_000);
  await expect(page.locator("output")).toContainText('"plays":1');
  await expect(page.locator("output")).toContainText('"playing":false');
});

test("partial media APIs cannot break connection or background recovery", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "audioSession", { value: { set type(_value: string) { throw new Error("unsupported"); } } });
    Object.defineProperty(window, "MediaMetadata", { value: undefined });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mount(page);
  await expect(page.locator("output")).toContainText('"playing":true');
  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await expect(page.locator("output")).toContainText('"recoveries":1');
  expect(errors).toEqual([]);
});

test("background reconnect repeats after failed attempts and stops on desktop rejection", async ({ page }) => {
  await page.clock.install();
  let attempts = 0;
  await page.routeWebSocket("ws://127.0.0.1:44009/eko", (socket) => {
    attempts += 1;
    if (attempts < 3) socket.close();
    else socket.onMessage((message) => {
      const data: unknown = JSON.parse(String(message));
      if (typeof data === "object" && data !== null && "kind" in data && data.kind === "joinRequest") {
        socket.send(JSON.stringify({ kind: "joinRejected", reason: "Fixture denied" }));
      }
    });
  });
  await mount(page, "app");
  await page.getByRole("button", { name: "Ask desktop" }).click();
  await expect.poll(() => attempts).toBe(1);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }));
  await page.clock.runFor(5_000);
  await expect.poll(() => attempts).toBe(2);
  await page.clock.runFor(15_000);
  await expect.poll(() => attempts).toBe(3);
  await expect(page.getByText(/desktop rejected this receiver/)).toBeVisible();
  await page.clock.runFor(60_000);
  expect(attempts).toBe(3);
});

test("lock-screen actions stay registered across pause and stop updates", async ({ page }) => {
  await page.addInitScript(() => {
    const handlers = new Map<string, MediaSessionActionHandler>();
    let registrations = 0;
    let noneStates = 0;
    Object.defineProperty(navigator, "mediaSession", { value: {
      metadata: null,
      set playbackState(value: string) {
        if (value === "none") noneStates += 1;
        document.documentElement.dataset.noneStates = String(noneStates);
      },
      setActionHandler(action: string, handler: MediaSessionActionHandler | null) {
        if (handler) { handlers.set(action, handler); registrations += 1; }
        else handlers.delete(action);
        document.documentElement.dataset.registrations = String(registrations);
      },
    } });
    window.addEventListener("fixture-media-action", (event) => {
      if (!(event instanceof CustomEvent)) return;
      if (event.detail === "pause" || event.detail === "play" || event.detail === "stop") handlers.get(event.detail)?.({ action: event.detail });
    });
  });
  await mount(page);
  await expect(page.locator("output")).toContainText('"playing":true');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-media-action", { detail: "pause" })));
  await expect(page.locator("output")).toContainText('"playing":false');
  await expect(page.locator("html")).toHaveAttribute("data-registrations", "3");
  await expect(page.locator("html")).toHaveAttribute("data-none-states", "0");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-media-action", { detail: "stop" })));
  await expect(page.locator("output")).toContainText('"connected":false');
});

test("a user pause survives replacement of a broken receiver session", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Native {
      private deliver: () => void;
      constructor(config?: RTCConfiguration) {
        super(config);
        this.deliver = () => {
          const context = new AudioContext();
          const stream = context.createMediaStreamDestination().stream;
          const track = stream.getAudioTracks()[0];
          const transceiver = this.addTransceiver("audio");
          this.ontrack?.(new RTCTrackEvent("track", { receiver: transceiver.receiver, transceiver, track, streams: [stream] }));
        };
        window.addEventListener("fixture-stream", this.deliver);
        document.documentElement.dataset.peerCount = String(Number(document.documentElement.dataset.peerCount ?? 0) + 1);
      }
      close() {
        window.removeEventListener("fixture-stream", this.deliver);
        super.close();
      }
    };
    HTMLMediaElement.prototype.play = async function () { this.dispatchEvent(new Event("playing")); };
    HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event("pause")); };
  });
  let dropConnection = () => {};
  let attempts = 0;
  await page.routeWebSocket("ws://127.0.0.1:44009/eko", (socket) => {
    attempts += 1;
    dropConnection = () => socket.close();
  });
  await mount(page, "app");
  await page.getByRole("button", { name: "Ask desktop" }).click();
  await expect.poll(() => attempts).toBe(1);
  await expect(page.locator("html")).toHaveAttribute("data-peer-count", "1");
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-stream")));
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  dropConnection();
  await page.clock.runFor(5_000);
  await expect.poll(() => attempts).toBe(2);
  await expect(page.locator("html")).toHaveAttribute("data-peer-count", "2");
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-stream")));
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});
