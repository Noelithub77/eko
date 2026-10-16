import { startNativeSender } from "./native-sender.mjs";
import { chromium } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
const summary = (values) => ({ count: values.length, averageMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, p95Ms: percentile(values, .95), maxMs: values.length ? Math.max(...values) : null });

// Uses the real receiver UI, real room approval protocol, real ephemeral TURN
// credentials and real media. Browser-only overrides are confined to this fixture.
export async function mediaExperiment({ relayUrl, clientUrl, path, targetMs, seconds, protocol = "udp", senderType = "browser" }) {
  const started = performance.now();
  const timeline = [];
  let lastMark = started;
  const mark = (stage, since = lastMark) => {
    const now = performance.now();
    timeline.push({ stage, elapsedMs: now - started, durationMs: now - since, sincePreviousMs: now - lastMark });
    lastMark = now;
  };
  let browser, host, native;
  let room;
  try {
    let stage = performance.now();
    const created = await fetch(`${relayUrl}/v1/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(10000) });
    if (!created.ok) throw new Error(`Room creation HTTP ${created.status}`);
    room = await created.json();
    mark("roomCreated", stage);
    stage = performance.now();
    const credentials = await fetch(`${relayUrl}/v1/rooms/${room.roomId}/turn`, { headers: { authorization: `Bearer ${room.hostToken}` }, signal: AbortSignal.timeout(10000) });
    if (!credentials.ok) throw new Error(`Host TURN credentials HTTP ${credentials.status}`);
    const turn = await credentials.json();
    const iceServers = turn.iceServers.flatMap((server) => {
      const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => {
        if (path !== "turn") return url.startsWith("stun:");
        if (protocol === "tls") return url.startsWith("turns:");
        if (protocol === "tcp") return url.startsWith("turn:") && url.includes("transport=tcp");
        return url.startsWith("turn:") && !url.includes("transport=tcp");
      });
      return urls.length ? [{ ...server, urls }] : [];
    });
    if (!iceServers.length) throw new Error(`No ICE servers for ${path}/${protocol}`);
    mark("hostTurnCredentials", stage);
    host = new WebSocket(room.socketUrl);
    const signals = [];
    const controls = [];
    const samples = [];
    let accepting = false;
    host.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type !== "signal") { controls.push(message); return; }
      if (message.payload?.kind === "clockSyncRequest") {
        send(message.deviceId, { ...message.payload, kind: "clockSyncResponse", serverReceivedAtMs: Date.now(), serverSentAtMs: Date.now() });
        return;
      }
      if (message.payload?.kind === "profilerSample") { samples.push(message.payload.sample); return; }
      signals.push(message);
    });
    const send = (deviceId, payload) => host.send(JSON.stringify({ type: "signal", deviceId, payload }));
    await new Promise((resolve, reject) => { host.addEventListener("open", resolve, { once: true }); host.addEventListener("error", () => reject(new Error("Host signaling failed")), { once: true }); });
    host.send(JSON.stringify({ type: "hello", role: "host", token: room.hostToken }));
    await wait(() => controls.find((message) => message.type === "ready"), "host signaling ready");
    mark("hostSignalingReady");
    browser = await chromium.launch({ executablePath: process.env.EKO_CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
    const receiver = await browser.newPage();
    // Fetch receiver credentials through the real authenticated Worker endpoint;
    // constrain only this fixture to the protocol being compared.
    await receiver.route("**/turn", async (route) => {
      const before = performance.now();
      const response = await route.fetch();
      const body = await response.json();
      const filtered = body.iceServers?.flatMap((server) => {
        const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => path !== "turn" ? url.startsWith("stun:") : protocol === "tls" ? url.startsWith("turns:") : protocol === "tcp" ? url.startsWith("turn:") && url.includes("transport=tcp") : url.startsWith("turn:") && !url.includes("transport=tcp"));
        return urls.length ? [{ ...server, urls }] : [];
      });
      await route.fulfill({ response, json: { ...body, iceServers: filtered } });
      mark("receiverTurnCredentials", before);
    });
    const errors = [];
    receiver.on("pageerror", (error) => errors.push(error.message));
    await receiver.addInitScript(({ forceRelay, target }) => {
      const Native = window.RTCPeerConnection;
      window.__ekoBenchPeers = [];
      window.__ekoBenchMarkers = [];
      window.RTCPeerConnection = class extends Native {
        constructor(config) {
          super({ ...config, iceTransportPolicy: forceRelay ? "relay" : "all" });
          window.__ekoBenchPeers.push(this);
          this.addEventListener("track", () => {
            for (const receiver of this.getReceivers()) {
              if (receiver.track.kind === "audio" && "jitterBufferTarget" in receiver) receiver.jitterBufferTarget = target;
            }
          });
        }
        setConfiguration(config) { super.setConfiguration({ ...config, iceTransportPolicy: forceRelay ? "relay" : "all" }); }
      };
    }, { forceRelay: path === "turn", target: targetMs });
    const payload = { version: 1, local: { host: "127.0.0.1", port: 9 }, hosted: { roomId: room.roomId, joinToken: room.joinToken, socketUrl: room.socketUrl, clientUrl: room.clientUrl } };
    stage = performance.now();
    await receiver.goto(`${clientUrl}#payload=${Buffer.from(JSON.stringify(payload)).toString("base64url")}`, { waitUntil: "networkidle" });
    mark("receiverPageLoaded", stage);
    stage = performance.now();
    await receiver.getByRole("button", { name: "Ask Desktop" }).click();
    const join = await wait(() => signals.find((message) => message.payload?.kind === "joinRequest"), "join request");
    mark("joinRequested", stage);
    const deviceId = join.deviceId;
    send(deviceId, { kind: "approvalWaiting", deviceId, session: {} });
    await receiver.getByText("Waiting for the user to accept").waitFor();
    const peersBeforeApproval = await receiver.evaluate(() => window.__ekoBenchPeers.every((peer) => peer.connectionState !== "connected"));
    if (!peersBeforeApproval) throw new Error("Media connected before desktop approval");
    mark("approvalWaitingVisible");
    stage = performance.now();
    accepting = true;
    send(deviceId, { kind: "permissionChanged", deviceId, state: "connecting", session: {} });
    await wait(() => signals.find((message) => message.payload?.kind === "receiverReady"), "receiver ready");
    mark("approvalToReceiverReady", stage);
    let sender;
    if (senderType === "native") {
      stage = performance.now();
      native = await startNativeSender({ iceServers, deviceId, forceRelay: path === "turn", sendSignal: (payload) => send(deviceId, payload) });
      mark("nativeSenderPrepared", stage);
      stage = performance.now();
    } else {
    sender = await browser.newPage();
    await sender.goto(clientUrl, { waitUntil: "domcontentloaded" });
    await sender.exposeFunction("ekoSend", (payload) => send(deviceId, payload));
    stage = performance.now();
    await sender.evaluate(async ({ iceServers, forceRelay, deviceId }) => {
      const peer = new RTCPeerConnection({ iceServers, iceTransportPolicy: forceRelay ? "relay" : "all" });
      window.__ekoPeer = peer;
      const audio = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = 1400;
      const gain = audio.createGain(); gain.gain.value = 0;
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination);
      oscillator.start(); await audio.resume();
      window.__ekoAudio = { audio, gain, oscillator };
      peer.addTrack(destination.stream.getAudioTracks()[0], destination.stream);
      peer.onicecandidate = (event) => { if (event.candidate) void window.ekoSend({ kind: "hostIceCandidate", candidate: { deviceId, candidate: JSON.stringify(event.candidate.toJSON()) } }); };
      await peer.setLocalDescription(await peer.createOffer());
      await window.ekoSend({ kind: "hostOffer", description: { deviceId, sdp: peer.localDescription.sdp } });
    }, { iceServers, forceRelay: path === "turn", deviceId });
    }
    const answer = await wait(() => signals.find((message) => message.payload?.kind === "answer"), "answer");
    const firstCandidate = signals.findIndex((message) => message.payload?.kind === "iceCandidate");
    const answerIndex = signals.indexOf(answer);
    if (firstCandidate >= 0 && firstCandidate < answerIndex) throw new Error("Receiver ICE candidate preceded answer");
    if (native) native.answer(answer.payload.description);
    else await sender.evaluate(async (description) => window.__ekoPeer.setRemoteDescription({ type: "answer", sdp: description.sdp }), answer.payload.description);
    send(deviceId, { kind: "playbackSchedule", playAtServerMs: Date.now(), jitterBufferTargetMs: targetMs });
    mark("offerToAnswer", stage);
    const candidateTimer = setInterval(() => {
      const candidates = signals.filter((message) => message.payload?.kind === "iceCandidate" && !message.applied);
      for (const message of candidates) {
        message.applied = true;
        if (native) { native.candidate(message.payload.candidate); continue; }
        void sender.evaluate((candidate) => window.__ekoPeer.addIceCandidate(candidate), JSON.parse(message.payload.candidate.candidate)).catch((error) => errors.push(error.message));
      }
    }, 50);
    try {
      if (native) {
        const deadline = Date.now() + 20000;
        let connected = false;
        while (Date.now() < deadline) {
          const state = await native.stats();
          if (state.peers.some((peer) => peer.peerConnectionState === "connected")) { connected = true; break; }
          await sleep(100);
        }
        if (!connected) throw new Error("Native sender did not connect");
      } else await sender.waitForFunction(() => window.__ekoPeer.connectionState === "connected", undefined, { timeout: 20000 });
      mark("mediaConnected", stage);
      await receiver.getByRole("button", { name: "Pause", exact: true }).waitFor({ timeout: 20000 });
      await receiver.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && audio.currentTime > 0; }, { timeout: 15000 });
      mark("firstAudioPlayback", stage);
      let emitted = [], matches = [], markerDelays = [];
      if (!native) {
      // Tap decoded media with an AudioWorklet. No microphone, physical output or disk audio.
      await receiver.evaluate(async () => {
        const stream = document.querySelector("audio").srcObject;
        const audio = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
        await audio.resume();
        const code = `class Marker extends AudioWorkletProcessor {
          constructor() { super(); this.active = false; this.silent = 0; this.measuring = false; this.position = 0; this.crossings = []; this.previous = 0; }
          process(inputs) {
            const channel = inputs[0]?.[0]; if (!channel) return true;
            let peak = 0;
            for (let i = 0; i < channel.length; i++) {
              const value = channel[i]; peak = Math.max(peak, Math.abs(value));
              if (Math.abs(value) > .12 && !this.active) { this.active = true; this.silent = 0; this.measuring = true; this.position = 0; this.crossings = []; this.time = currentTime + i / sampleRate; }
              if (this.measuring) {
                if (this.previous <= 0 && value > 0) this.crossings.push(this.position);
                this.position++;
                if (this.position >= 768) {
                  const spans = this.crossings.length - 1;
                  const frequency = spans > 0 ? sampleRate * spans / (this.crossings[spans] - this.crossings[0]) : 0;
                  this.port.postMessage({time: this.time, frequency}); this.measuring = false;
                }
              }
              this.previous = value;
            }
            if (peak < .03) { this.silent++; if (this.silent > 30) this.active = false; } else this.silent = 0;
            return true;
          }
        } registerProcessor('eko-marker', Marker);`;
        const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        await audio.audioWorklet.addModule(url); URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(audio, "eko-marker");
        const baseMs = performance.timeOrigin + performance.now() - audio.currentTime * 1000;
        node.port.onmessage = (event) => window.__ekoBenchMarkers.push({ receivedAtMs: baseMs + event.data.time * 1000, frequency: event.data.frequency });
        const mute = audio.createGain(); mute.gain.value = 0;
        audio.createMediaStreamSource(stream).connect(node).connect(mute).connect(audio.destination);
        window.__ekoMarkerContext = audio;
      });
      await sleep(2000);
      emitted = await sender.evaluate((count) => {
        const { audio, gain, oscillator } = window.__ekoAudio;
        const baseMs = performance.timeOrigin + performance.now() - audio.currentTime * 1000;
        const markers = [];
        for (let index = 0; index < count; index++) {
          const when = audio.currentTime + .3 + index * 1.5;
          oscillator.frequency.setValueAtTime(600 + index * 300, when);
          gain.gain.setValueAtTime(.6, when); gain.gain.setValueAtTime(0, when + .08);
          markers.push({ id: index, sentAtMs: baseMs + when * 1000, frequency: 600 + index * 300 });
        }
        return markers;
      }, Math.max(3, Math.floor(seconds / 1.5)));
      await sleep(seconds * 1000);
      const detected = await receiver.evaluate(() => window.__ekoBenchMarkers);
      // Each pulse carries a distinct frequency, so a long stall cannot alias a
      // delayed pulse to the next source timestamp and look falsely fast.
      matches = emitted.map((source) => {
        const detection = detected.find((item) => Math.abs(item.frequency - source.frequency) < 100);
        return detection ? { id: source.id, delayMs: detection.receivedAtMs - source.sentAtMs } : null;
      }).filter((value) => value !== null && value.delayMs >= 0);
      markerDelays = matches.map((value) => value.delayMs);
      } else { await sleep(2000 + seconds * 1000); }
      const receiverStats = await peerStats(receiver, "window.__ekoBenchPeers[0]");
      const pipeline = native ? await native.stats() : null;
      const nativePeer = pipeline?.peers[0];
      const hostStats = native ? {
        state: nativePeer?.peerConnectionState, path: nativePeer?.selectedConnectionPath === "relayed" ? "relay" : "direct",
        localCandidateType: nativePeer?.selectedCandidateType, remoteCandidateType: nativePeer?.selectedRemoteCandidateType,
        bytesSent: nativePeer?.outboundAudioBytes, packetsSent: nativePeer?.outboundAudioPackets,
      } : await peerStats(sender, "window.__ekoPeer");
      if (path === "turn" && (receiverStats.path !== "relay" || hostStats.path !== "relay")) throw new Error("Forced TURN did not select relays at both endpoints");
      if (path === "direct" && (receiverStats.path !== "direct" || hostStats.path !== "direct")) throw new Error("Direct baseline selected a relay");
      const validSamples = samples.filter((sample) => sample.version === 2 && sample.bufferMs !== null);
      if (!accepting || validSamples.length < 3 || markerDelays.length < Math.ceil(emitted.length * .9) || errors.length) throw new Error(`Incomplete media run: profiles=${validSamples.length}, markers=${markerDelays.length}, pageErrors=${errors.length}`);
      await receiver.getByRole("button", { name: "Pause", exact: true }).click();
      await receiver.waitForFunction(() => document.querySelector("audio")?.paused === true);
      mark("pauseVerified");
      await receiver.getByRole("button", { name: "Play", exact: true }).click();
      await receiver.waitForFunction(() => document.querySelector("audio")?.paused === false);
      mark("resumeVerified");
      return { success: true, senderType, pipeline, path, protocol: path === "turn" ? protocol : null, targetMs, timeline, host: hostStats, receiver: receiverStats, profileSamples: validSamples.length, estimatedDelay: summary(validSamples.flatMap((sample) => sample.latencyMs === null ? [] : [sample.latencyMs])), buffer: summary(validSamples.map((sample) => sample.bufferMs)), roundTrip: summary(validSamples.flatMap((sample) => sample.roundTripMs == null ? [] : [sample.roundTripMs])), jitter: summary(validSamples.flatMap((sample) => sample.jitterMs === null ? [] : [sample.jitterMs])), packetLossPercent: validSamples.map((sample) => sample.packetLossPercent), softwareMarkerDelay: summary(markerDelays), markersEmitted: emitted.length, markersDetected: markerDelays.length, markerMatches: matches, samples: validSamples };
    } finally { clearInterval(candidateTimer); }
  } catch (error) {
    return { success: false, senderType, path, protocol, targetMs, timeline, error: error.message.replace(/#\S+/g, "#<redacted>") };
  } finally {
    if (host?.readyState === WebSocket.OPEN) { host.send(JSON.stringify({ type: "closeRoom" })); host.close(); }
    await native?.close();
    await browser?.close();
  }
}

async function wait(read, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const result = read(); if (result) return result; await sleep(25); }
  throw new Error(`Timed out waiting for ${label}`);
}

async function peerStats(page, expression) {
  return page.evaluate(async (expression) => {
    const peer = expression.includes("BenchPeers") ? window.__ekoBenchPeers[0] : window.__ekoPeer;
    const stats = await peer.getStats();
    const transport = [...stats.values()].find((item) => item.type === "transport" && item.selectedCandidatePairId);
    const pair = transport ? stats.get(transport.selectedCandidatePairId) : null;
    const local = pair ? stats.get(pair.localCandidateId) : null;
    const remote = pair ? stats.get(pair.remoteCandidateId) : null;
    const audio = [...stats.values()].find((item) => item.type === "inbound-rtp" && item.kind === "audio");
    const out = [...stats.values()].find((item) => item.type === "outbound-rtp" && item.kind === "audio");
    return { state: peer.connectionState, path: local?.candidateType === "relay" || remote?.candidateType === "relay" ? "relay" : "direct", localCandidateType: local?.candidateType ?? null, remoteCandidateType: remote?.candidateType ?? null, protocol: local?.protocol ?? null, relayProtocol: local?.relayProtocol ?? null, roundTripMs: pair?.currentRoundTripTime === undefined ? null : pair.currentRoundTripTime * 1000, packetsReceived: audio?.packetsReceived ?? null, packetsLost: audio?.packetsLost ?? null, concealedSamples: audio?.concealedSamples ?? null, totalSamplesReceived: audio?.totalSamplesReceived ?? null, bytesSent: out?.bytesSent ?? null, requestedBufferMs: peer.getReceivers().find((item) => item.track.kind === "audio")?.jitterBufferTarget ?? null };
  }, expression);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = JSON.parse(process.argv[2]);
  const results = [];
  for (const path of options.paths) {
    for (const protocol of path === "turn" ? options.protocols : ["udp"]) {
      for (const targetMs of options.targets) {
        for (let run = 1; run <= options.runs; run++) {
          console.error(`[eko latency] ${path}/${protocol} target=${targetMs}ms run=${run}`);
          const result = await mediaExperiment({ ...options, path, protocol, targetMs });
          const observedP95 = result.success ? Math.max(result.estimatedDelay.p95Ms ?? 0, result.softwareMarkerDelay.p95Ms ?? 0) : null;
          const performancePassed = options.maxDelayMs == null ? null : observedP95 !== null && observedP95 > 0 && observedP95 <= options.maxDelayMs;
          results.push({ run, ...result, workflowSuccess: result.success, delayBudgetMs: options.maxDelayMs ?? null, performancePassed, success: result.success && performancePassed !== false });
        }
      }
    }
  }
  const success = results.every((result) => result.success);
  console.log(JSON.stringify({ environment: "isolated-browser-real-network", success, relayOrigin: options.relayUrl, measurement: options.senderType === "native" ? "Production Rust capture/Opus/WebRTC sender to real browser receiver through actual ICE/TURN. Stage times and partial receiver delay; no physical speaker or marker measurement." : "Synthetic browser sender to real receiver UI through actual ICE/TURN. Software marker timing excludes desktop capture and physical output; it has cross-context clock and scheduling uncertainty.", results }));
  if (!success) process.exitCode = 1;
}
