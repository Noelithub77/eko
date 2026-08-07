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
const host = await openSocket(room.socketUrl);
const receiver = await openSocket(room.socketUrl);

const hostReady = expectMessage(
  host,
  (message) => message.type === "ready" && message.role === "host",
);
const receiverReady = expectMessage(
  receiver,
  (message) => message.type === "ready" && message.role === "receiver",
);
host.send(JSON.stringify({ type: "hello", role: "host", token: room.hostToken }));
receiver.send(
  JSON.stringify({
    type: "hello",
    role: "receiver",
    token: room.joinToken,
    deviceId: "smoke-phone",
  }),
);
await Promise.all([hostReady, receiverReady]);

const forwardedCandidate = expectMessage(
  host,
  (message) => message.type === "signal" && message.deviceId === "smoke-phone",
);
receiver.send(
  JSON.stringify({
    type: "signal",
    payload: {
      kind: "iceCandidate",
      candidate: { deviceId: "smoke-phone", candidate: "candidate:smoke 1 udp" },
    },
  }),
);
await forwardedCandidate;

host.send(JSON.stringify({ type: "closeRoom" }));
host.close();
receiver.close();

const client = await fetch(`${relayUrl}/client`);
if (!client.ok || !(client.headers.get("content-type") ?? "").includes("text/html")) {
  throw new Error("Hosted client is not available");
}

console.log(`Eko hosted relay smoke test passed: ${relayUrl}`);

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
