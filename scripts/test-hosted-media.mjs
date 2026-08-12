import { chromium } from "@playwright/test";

const relayUrl = (process.env.EKO_RELAY_URL ?? "https://eko.noelmcv7.workers.dev").replace(
  /\/$/,
  "",
);
const room = await createRoom(relayUrl);
const host = await openSocket(room.socketUrl);
const inbox = createHostInbox(host);
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

try {
  host.send(JSON.stringify({ type: "hello", role: "host", token: room.hostToken }));
  await inbox.waitForControl("ready");

  const receiverPage = await browser.newPage();
  const pageErrors = [];
  receiverPage.on("pageerror", (error) => pageErrors.push(error.message));
  const pairingHash = new URLSearchParams({
    v: "1",
    h: "192.168.1.20",
    p: "13370",
    r: room.roomId,
    t: room.joinToken,
  });
  await receiverPage.goto(`${room.clientUrl}#${pairingHash}`, { waitUntil: "networkidle" });
  await receiverPage.getByRole("button", { name: "Ask Desktop" }).click();

  const join = await inbox.waitForSignal("joinRequest");
  const deviceId = join.deviceId;
  sendToReceiver(host, deviceId, {
    kind: "approvalWaiting",
    deviceId,
    session: {},
  });
  await receiverPage.getByText("Waiting for the user to accept").waitFor({ state: "visible" });
  sendToReceiver(host, deviceId, {
    kind: "permissionChanged",
    deviceId,
    state: "connecting",
    session: {},
  });
  await inbox.waitForSignal("receiverReady");

  const hostPage = await browser.newPage();
  await hostPage.exposeFunction("sendEkoHostSignal", (payload) => {
    sendToReceiver(host, deviceId, payload);
  });
  await startBrowserHost(hostPage, deviceId);

  const answer = await inbox.waitForSignal("answer");
  const answerIndex = inbox.signalKinds.indexOf("answer");
  const firstCandidateIndex = inbox.signalKinds.indexOf("iceCandidate");
  if (firstCandidateIndex !== -1 && firstCandidateIndex < answerIndex) {
    throw new Error("Receiver sent an ICE candidate before its SDP answer");
  }
  await hostPage.evaluate(async (description) => {
    await window.__ekoHostPeer.setRemoteDescription({ type: "answer", sdp: description.sdp });
  }, answer.payload.description);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const message of inbox.takeSignals("iceCandidate")) {
      const candidate = JSON.parse(message.payload.candidate.candidate);
      await hostPage.evaluate(async (value) => {
        await window.__ekoHostPeer.addIceCandidate(value);
      }, candidate);
    }
    const state = await hostPage.evaluate(() => window.__ekoHostPeer.connectionState);
    if (state === "connected") {
      break;
    }
    await delay(100);
  }

  await delay(1_000);

  const hostResult = await hostPage.evaluate(async () => {
    const peer = window.__ekoHostPeer;
    const stats = await peer.getStats();
    let bytesSent = 0;
    let selectedCandidateType = "unknown";
    for (const report of stats.values()) {
      if (report.type === "outbound-rtp" && !report.isRemote) {
        bytesSent += report.bytesSent ?? 0;
      }
      if (report.type === "transport" && report.selectedCandidatePairId) {
        const pair = stats.get(report.selectedCandidatePairId);
        const local = pair ? stats.get(pair.localCandidateId) : null;
        selectedCandidateType = local?.candidateType ?? selectedCandidateType;
      }
    }
    return { state: peer.connectionState, bytesSent, selectedCandidateType };
  });
  if (hostResult.state !== "connected" || hostResult.bytesSent <= 0) {
    throw new Error(`WebRTC media did not flow: ${JSON.stringify(hostResult)}`);
  }
  if (hostResult.selectedCandidateType === "relay") {
    throw new Error("Media unexpectedly selected a TURN relay candidate");
  }

  await receiverPage.getByRole("button", { name: "Pause" }).waitFor({ state: "visible" });
  const receiverResult = await receiverPage.evaluate(() => {
    const audio = document.querySelector("audio");
    const stream = audio?.srcObject;
    return {
      hasLiveAudio:
        stream instanceof MediaStream &&
        stream.getAudioTracks().some((track) => track.readyState === "live"),
      paused: audio?.paused ?? true,
      muted: audio?.muted ?? true,
      volume: audio?.volume ?? 0,
    };
  });
  if (
    !receiverResult.hasLiveAudio ||
    receiverResult.paused ||
    receiverResult.muted ||
    receiverResult.volume !== 1 ||
    pageErrors.length > 0
  ) {
    throw new Error(
      `Receiver did not play live audio: ${JSON.stringify({ receiverResult, pageErrors })}`,
    );
  }

  console.log(
    `Eko hosted signaling media test passed: ${hostResult.selectedCandidateType}, ${hostResult.bytesSent} bytes sent`,
  );
} finally {
  host.send(JSON.stringify({ type: "closeRoom" }));
  host.close();
  await browser.close();
}

async function createRoom(baseUrl) {
  const health = await fetch(`${baseUrl}/health`);
  if (!health.ok) {
    throw new Error(`Relay health failed with ${health.status}`);
  }
  const response = await fetch(`${baseUrl}/v1/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`Room creation failed with ${response.status}`);
  }
  return response.json();
}

async function startBrowserHost(page, deviceId) {
  await page.evaluate(
    async ({ receiverId }) => {
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }],
        iceTransportPolicy: "all",
      });
      window.__ekoHostPeer = peer;
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      await audio.resume();
      peer.addTrack(destination.stream.getAudioTracks()[0], destination.stream);
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          void window.sendEkoHostSignal({
            kind: "hostIceCandidate",
            candidate: {
              deviceId: receiverId,
              candidate: JSON.stringify(event.candidate.toJSON()),
            },
          });
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await window.sendEkoHostSignal({
        kind: "hostOffer",
        description: { deviceId: receiverId, sdp: peer.localDescription.sdp },
      });
    },
    { receiverId: deviceId },
  );
}

function createHostInbox(socket) {
  const controls = [];
  const signals = [];
  const signalKinds = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type !== "signal") {
      controls.push(message);
      return;
    }
    if (message.payload?.kind === "clockSyncRequest") {
      const now = Date.now();
      sendToReceiver(socket, message.deviceId, {
        kind: "clockSyncResponse",
        requestId: message.payload.requestId,
        clientSentAtMs: message.payload.clientSentAtMs,
        serverReceivedAtMs: now,
        serverSentAtMs: Date.now(),
      });
      return;
    }
    signals.push(message);
    signalKinds.push(message.payload?.kind ?? "unknown");
  });
  return {
    signalKinds,
    waitForControl: (type) => waitForItem(controls, (message) => message.type === type),
    waitForSignal: (kind) =>
      waitForItem(signals, (message) => message.payload?.kind === kind, false),
    takeSignals: (kind) => takeItems(signals, (message) => message.payload?.kind === kind),
  };
}

function waitForItem(items, matches, remove = true) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    const check = () => {
      const index = items.findIndex(matches);
      if (index !== -1) {
        const [item] = remove ? items.splice(index, 1) : [items[index]];
        resolve(item);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("Timed out waiting for relay workflow message"));
        return;
      }
      setTimeout(check, 20);
    };
    check();
  });
}

function takeItems(items, matches) {
  const selected = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (matches(items[index])) {
      selected.unshift(...items.splice(index, 1));
    }
  }
  return selected;
}

function sendToReceiver(socket, deviceId, payload) {
  socket.send(JSON.stringify({ type: "signal", deviceId, payload }));
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error(`Could not open ${url}`)), {
      once: true,
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
