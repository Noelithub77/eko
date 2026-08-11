import { chromium } from "@playwright/test";

const relayUrl = (process.env.EKO_RELAY_URL ?? "https://eko.noelmcv7.workers.dev").replace(
  /\/$/,
  "",
);

const health = await fetch(`${relayUrl}/health`);
if (!health.ok) {
  throw new Error(`Relay health failed with ${health.status}`);
}

const roomResponse = await fetch(`${relayUrl}/v1/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
if (!roomResponse.ok) {
  throw new Error(`Room creation failed with ${roomResponse.status}`);
}
const room = await roomResponse.json();
const browser = await chromium.launch({ headless: true });
const host = await openSocket(room.socketUrl);
const hostReady = expectMessage(
  host,
  (message) => message.type === "ready" && message.role === "host",
);
host.send(JSON.stringify({ type: "hello", role: "host", token: room.hostToken }));
await hostReady;
const page = await browser.newPage();
const pageErrors = [];
const diagnostics = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
page.on("requestfailed", (request) =>
  diagnostics.push(`request-failed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`),
);
page.on("websocket", (socket) => {
  diagnostics.push(`websocket-open:${socket.url()}`);
  socket.on("framesent", (frame) => diagnostics.push(`websocket-sent:${frameType(frame)}`));
  socket.on("framereceived", (frame) => diagnostics.push(`websocket-received:${frameType(frame)}`));
  socket.on("close", () => diagnostics.push(`websocket-close:${socket.url()}`));
});

const pairingHash = new URLSearchParams({
  v: "1",
  h: "192.168.1.20",
  p: "13370",
  r: room.roomId,
  t: room.joinToken,
});
const clientUrl = `${room.clientUrl}#${pairingHash.toString()}`;

await page.goto(clientUrl, { waitUntil: "networkidle" });
const askButton = page.getByRole("button", { name: "Ask Desktop" });
await askButton.waitFor({ state: "visible" });
await delay(1_000);
if (diagnostics.some((entry) => entry === "websocket-sent:signal:joinRequest")) {
  throw new Error("Deployed client asked the desktop before Ask Desktop was clicked");
}
if (!(await askButton.isEnabled())) {
  throw new Error("Deployed client did not accept the compact pairing link");
}
const joinRequest = waitForBrowserJoin(host, diagnostics);
await askButton.click();
await delay(2_500);

let joinMessage;
try {
  joinMessage = await joinRequest;
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : String(error)} Diagnostics: ${diagnostics.join(" | ")}`,
  );
}
if (pageErrors.length > 0) {
  throw new Error(`Deployed client page error: ${pageErrors.join(" | ")}`);
}
if (
  joinMessage.payload.kind !== "joinRequest" ||
  joinMessage.payload.request?.method !== "qr" ||
  typeof joinMessage.payload.request?.deviceId !== "string"
) {
  throw new Error("Desktop did not receive the browser join request");
}
host.send(
  JSON.stringify({
    type: "signal",
    deviceId: joinMessage.deviceId,
    payload: {
      kind: "approvalWaiting",
      deviceId: joinMessage.deviceId,
      session: {},
    },
  }),
);
await page.getByText("Waiting for the user to accept").waitFor({ state: "visible" });

host.send(JSON.stringify({ type: "closeRoom" }));
host.close();
await browser.close();

const client = await fetch(`${relayUrl}/client`);
if (!client.ok || !(client.headers.get("content-type") ?? "").includes("text/html")) {
  throw new Error("Hosted client is not available");
}

console.log(`Eko hosted browser ask-desktop smoke test passed: ${relayUrl}`);

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error(`Could not open ${url}`)), {
      once: true,
    });
  });
}

function expectMessage(socket, matches) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for relay message")),
      5_000,
    );
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (!matches(message)) {
        return;
      }
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

function waitForBrowserJoin(socket, diagnostics) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for the browser join request")),
      10_000,
    );
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      diagnostics.push(
        `host-received:${message.type}:${message.payload?.kind ?? message.role ?? "unknown"}`,
      );
      if (message.type !== "signal" || typeof message.deviceId !== "string") {
        return;
      }
      if (message.payload?.kind === "clockSyncRequest") {
        const now = Date.now();
        socket.send(
          JSON.stringify({
            type: "signal",
            deviceId: message.deviceId,
            payload: {
              kind: "clockSyncResponse",
              requestId: message.payload.requestId,
              clientSentAtMs: message.payload.clientSentAtMs,
              serverReceivedAtMs: now,
              serverSentAtMs: Date.now(),
            },
          }),
        );
        return;
      }
      if (message.payload?.kind !== "joinRequest") {
        return;
      }
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

function frameType(frame) {
  try {
    const value = JSON.parse(typeof frame === "string" ? frame : frame.toString());
    if (value.type === "hello") {
      return `hello:${value.role}`;
    }
    if (value.type === "signal") {
      return `signal:${value.payload?.kind ?? "unknown"}`;
    }
    return value.type ?? "unknown";
  } catch {
    return "non-json";
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
