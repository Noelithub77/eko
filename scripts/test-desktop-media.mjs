import { chromium } from "@playwright/test";

const desktopCdpUrl = process.env.EKO_DESKTOP_CDP_URL ?? "http://127.0.0.1:9223";
const desktopBrowser = await chromium.connectOverCDP(desktopCdpUrl);
const desktopPage = desktopBrowser.contexts().flatMap((context) => context.pages())[0];
if (!desktopPage) {
  throw new Error(`No Eko desktop WebView found at ${desktopCdpUrl}`);
}

const receiverBrowser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
let streamStarted = false;

try {
  const result = await invokeDesktop(desktopPage, "start_stream");
  streamStarted = true;
  if (!result.qrPayload.hosted) {
    throw new Error("Desktop started without hosted signaling details");
  }

  const receiverPage = await receiverBrowser.newPage();
  const pageErrors = [];
  receiverPage.on("pageerror", (error) => pageErrors.push(error.message));
  const hosted = result.qrPayload.hosted;
  const pairingHash = new URLSearchParams({
    v: "1",
    h: result.qrPayload.local.host,
    p: String(result.qrPayload.local.port),
    r: hosted.roomId,
    t: hosted.joinToken,
  });
  await receiverPage.goto(`${hosted.clientUrl}#${pairingHash}`, { waitUntil: "networkidle" });
  await receiverPage.getByRole("button", { name: "Ask Desktop" }).click();

  const pendingDevice = await waitForDesktopDevice(desktopPage, (device) =>
    ["pending", "connecting"].includes(device.state),
  );
  await invokeDesktop(desktopPage, "allow_device", { deviceId: pendingDevice.deviceId });
  await receiverPage.getByRole("button", { name: "Pause" }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await delay(2_000);

  const connectedDevice = await waitForDesktopDevice(
    desktopPage,
    (device) => device.deviceId === pendingDevice.deviceId && device.state === "connected",
  );
  const receiverState = await receiverPage.evaluate(() => {
    const audio = document.querySelector("audio");
    const stream = audio?.srcObject;
    return {
      currentTime: audio?.currentTime ?? 0,
      paused: audio?.paused ?? true,
      muted: audio?.muted ?? true,
      volume: audio?.volume ?? 0,
      liveTracks:
        stream instanceof MediaStream
          ? stream.getAudioTracks().filter((track) => track.readyState === "live").length
          : 0,
    };
  });
  const capture = await invokeDesktop(desktopPage, "get_audio_capture_status");
  if (
    connectedDevice.iceState.toLowerCase() !== "connected" ||
    receiverState.liveTracks === 0 ||
    receiverState.paused ||
    receiverState.muted ||
    receiverState.volume !== 1 ||
    receiverState.currentTime <= 0 ||
    pageErrors.length > 0
  ) {
    throw new Error(
      `Desktop media workflow failed: ${JSON.stringify({ connectedDevice, receiverState, capture, pageErrors })}`,
    );
  }

  console.log(
    `Eko desktop media test passed: ${result.qrPayload.local.host}, ICE ${connectedDevice.iceState}, ${receiverState.currentTime.toFixed(2)}s played`,
  );
} finally {
  if (streamStarted) {
    await invokeDesktop(desktopPage, "stop_stream").catch(() => undefined);
  }
  await receiverBrowser.close();
  await desktopBrowser.close();
}

async function waitForDesktopDevice(page, matches) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const session = await invokeDesktop(page, "get_room_session");
    const device = session.devices.find(matches);
    if (device) {
      return device;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the desktop device state");
}

async function invokeDesktop(page, command, args = {}) {
  return page.evaluate(
    async ({ invokeCommand, invokeArgs }) => {
      if (!window.__TAURI_INTERNALS__?.invoke) {
        throw new Error("Tauri invoke API is unavailable");
      }
      return window.__TAURI_INTERNALS__.invoke(invokeCommand, invokeArgs);
    },
    { invokeCommand: command, invokeArgs: args },
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
