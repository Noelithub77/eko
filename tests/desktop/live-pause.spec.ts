import { expect, test } from "@playwright/test";

test("web pause keeps consuming live audio and resumes without a backlog", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Native {
      constructor(config?: RTCConfiguration) {
        super(config);
        window.addEventListener("fixture-stream", () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          void context.resume();
          const stream = destination.stream;
          const track = stream.getAudioTracks()[0];
          const transceiver = this.addTransceiver("audio");
          this.ontrack?.(new RTCTrackEvent("track", { receiver: transceiver.receiver, transceiver, track, streams: [stream] }));
        });
      }
    };
  });
  let joins = 0;
  await page.routeWebSocket("ws://127.0.0.1:44009/eko", (socket) => {
    socket.onMessage((message) => {
      const value: unknown = JSON.parse(String(message));
      if (typeof value === "object" && value !== null && "kind" in value && value.kind === "joinRequest") joins += 1;
    });
  });
  const payload = Buffer.from(JSON.stringify({ version: 1, local: { host: "127.0.0.1", port: 44009 } })).toString("base64url");
  await page.goto(`/@fs/${process.cwd()}/tests/desktop/playback-fixture.html?mode=app#payload=${payload}`);
  await page.getByRole("button", { name: "Ask desktop" }).click();
  await expect.poll(() => joins).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-stream")));
  const playback = () => page.evaluate(() => {
    const audio = document.querySelector("audio");
    if (!audio) throw new Error("Receiver audio element is missing");
    return {
      time: audio.currentTime,
      muted: audio.muted,
      consuming: !audio.paused && audio.srcObject instanceof MediaStream && audio.srcObject.getAudioTracks()[0].enabled,
      disconnected: audio.srcObject === null && audio.paused,
    };
  });
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await expect.poll(async () => (await playback()).time).toBeGreaterThan(0);

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
    await expect.poll(async () => {
      const { muted, consuming } = await playback();
      return { muted, consuming };
    }).toEqual({ muted: true, consuming: true });
    const pausedAt = (await playback()).time;
    await expect.poll(async () => (await playback()).time).toBeGreaterThan(pausedAt + 1);
    await page.locator("audio").dispatchEvent("playing");
    await page.evaluate(() => document.dispatchEvent(new Event("resume")));
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => (await playback()).muted).toBe(false);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  }
  expect(joins).toBe(1);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect.poll(async () => (await playback()).disconnected).toBe(true);
});
