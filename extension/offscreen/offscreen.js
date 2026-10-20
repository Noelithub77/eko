// Eko Chrome Extension - Offscreen Audio Engine & WebRTC Broadcaster
// Production-grade resilient architecture with smart reconnection, ICE restart, and staged recovery.

const DEFAULT_RELAY_URL = "https://eko.allpyq.in";
const STUN_SERVERS = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.cloudflare.com:53" }
];

// Reconnection & Resilience Constants
const PEER_DISCONNECT_GRACE_MS = 5000;       // 5s grace period for transient WebRTC disconnections
const MAX_ICE_RESTARTS = 2;                  // Max ICE restart attempts before peer recreation
const RECONNECT_INITIAL_DELAY_MS = 1000;     // Initial delay for socket backoff
const RECONNECT_MAX_DELAY_MS = 30000;        // Max backoff delay (30s)
const RECONNECT_BACKOFF_FACTOR = 1.8;        // Exponential growth factor
const RECONNECT_JITTER_RATIO = 0.2;          // +/- 20% jitter to prevent thundering herd
const MAX_SOCKET_RECONNECT_ATTEMPTS = 12;     // Max retry attempts before declaring failure
const MAX_DIAGNOSTIC_LOGS = 60;              // Diagnostic log history size

let state = {
  status: "idle",                            // 'idle' | 'starting' | 'streaming' | 'reconnecting' | 'error'
  reconnectStatus: "idle",                   // 'idle' | 'connection_lost' | 'reconnecting' | 'restoring_media' | 'restored'
  reconnectAttempt: 0,
  reconnectNextDelayMs: 0,
  networkOnline: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
  tabId: null,
  tabTitle: "",
  roomId: null,
  hostToken: null,
  joinToken: null,
  socketUrl: null,
  clientUrl: null,
  pairingUrl: null,
  autoApprove: true,
  muteLocal: false,
  devices: {},                               // deviceId -> { deviceId, deviceName, state, joinedAt, stats, reconnectStatus }
  pendingRequests: {},                       // deviceId -> { deviceId, deviceName, method, requestedAt }
  startedAt: null,
  error: null
};

// Internal engine resources
let capturedStream = null;
let audioContext = null;
let sourceNode = null;
let localGainNode = null;
let analyserNode = null;
let relaySocket = null;
let turnServers = [];
let isExplicitlyStopping = false;
let socketReconnectTimer = null;
let diagnosticLogs = [];

// Per-device connection management record:
// deviceId -> {
//   peer: RTCPeerConnection,
//   disconnectTimer: TimeoutId | null,
//   iceRestartAttempts: number,
//   isRestartingIce: boolean,
//   pendingCandidates: Array
// }
let peerRecords = {};

// Diagnostics Logger
function logDiagnostic(tag, message, level = "info") {
  const entry = {
    time: new Date().toLocaleTimeString(),
    tag,
    message,
    level
  };
  diagnosticLogs.push(entry);
  if (diagnosticLogs.length > MAX_DIAGNOSTIC_LOGS) {
    diagnosticLogs.shift();
  }
  const prefix = `[eko-diag][${tag}]`;
  if (level === "error") {
    console.error(prefix, message);
  } else if (level === "warn") {
    console.warn(prefix, message);
  } else {
    console.info(prefix, message);
  }
}

// Network Online/Offline Listeners
window.addEventListener("online", () => {
  logDiagnostic("NETWORK", "Browser reported online status.", "info");
  state.networkOnline = true;
  broadcastState();

  // If we were waiting for connectivity to reconnect relay socket, attempt immediately
  if ((state.status === "reconnecting" || (relaySocket && relaySocket.readyState !== WebSocket.OPEN)) && state.socketUrl) {
    logDiagnostic("RELAY", "Network restored. Triggering immediate relay reconnect.", "info");
    scheduleSocketReconnect(true);
  }
});

window.addEventListener("offline", () => {
  logDiagnostic("NETWORK", "Browser reported offline status.", "warn");
  state.networkOnline = false;
  if (state.status === "streaming" || state.status === "reconnecting") {
    state.reconnectStatus = "connection_lost";
    broadcastState();
  }
});

// Calculate Exponential Backoff with Jitter
function calculateBackoffDelay(attempt) {
  const exp = Math.min(attempt, 8);
  const base = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_INITIAL_DELAY_MS * Math.pow(RECONNECT_BACKOFF_FACTOR, exp)
  );
  // Apply +/- 20% jitter
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * RECONNECT_JITTER_RATIO;
  return Math.max(500, Math.round(base * jitterMultiplier));
}

// Message Listener from Background and Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  switch (message.type) {
    case "START_STREAM":
      isExplicitlyStopping = false;
      startStreaming(message.payload)
        .then(() => sendResponse({ success: true, state: getStateSummary() }))
        .catch(async (err) => {
          logDiagnostic("START", `Stream startup failed: ${err.message}`, "error");
          try {
            await stopStreaming();
          } catch (e) {}
          state.status = "error";
          state.error = err.message;
          broadcastState();
          sendResponse({ success: false, error: err.message, state: getStateSummary() });
        });
      return true;

    case "STOP_STREAM":
      isExplicitlyStopping = true;
      stopStreaming()
        .then(() => sendResponse({ success: true, state: getStateSummary() }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "APPROVE_DEVICE":
      approveDevice(message.deviceId)
        .then(() => sendResponse({ success: true, state: getStateSummary() }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "DENY_DEVICE":
      denyDevice(message.deviceId);
      sendResponse({ success: true, state: getStateSummary() });
      break;

    case "DISCONNECT_DEVICE":
      disconnectDevice(message.deviceId);
      sendResponse({ success: true, state: getStateSummary() });
      break;

    case "SET_AUTO_APPROVE":
      state.autoApprove = !!message.enabled;
      chrome.storage.local.set({ autoApprove: state.autoApprove });
      sendResponse({ success: true, autoApprove: state.autoApprove });
      break;

    case "SET_LOCAL_MUTE":
      setLocalMute(message.muted);
      sendResponse({ success: true, muted: state.muteLocal });
      break;

    case "RESET_ERROR":
      state.status = "idle";
      state.reconnectStatus = "idle";
      state.reconnectAttempt = 0;
      state.error = null;
      broadcastState();
      sendResponse({ success: true, state: getStateSummary() });
      break;

    case "GET_STATE":
      sendResponse({
        success: true,
        state: getStateSummary(),
        audioLevels: getAudioLevels()
      });
      break;

    case "GET_AUDIO_LEVELS":
      sendResponse({ levels: getAudioLevels() });
      break;

    case "GET_DIAGNOSTICS":
      sendResponse({
        success: true,
        logs: diagnosticLogs,
        reconnectStatus: state.reconnectStatus,
        reconnectAttempt: state.reconnectAttempt,
        nextDelayMs: state.reconnectNextDelayMs,
        networkOnline: state.networkOnline,
        audioTrackStatus: getAudioTrackStatus()
      });
      break;

    case "TRIGGER_RECONNECT":
      logDiagnostic("MANUAL", "Manual reconnect requested by user/diagnostics.", "info");
      scheduleSocketReconnect(true);
      sendResponse({ success: true });
      break;
  }
});

// Start Streaming Pipeline
async function startStreaming({ streamId, tabId, tabTitle, roomData, turnServers: incomingTurnServers = [] }) {
  if (state.status === "streaming" || state.status === "reconnecting") {
    await stopStreaming();
  }

  if (!roomData || !roomData.roomId || !roomData.socketUrl) {
    throw new Error("Invalid room data received from background service worker.");
  }

  logDiagnostic("SESSION", `Starting session for tab: "${tabTitle || tabId}" (Room: ${roomData.roomId.slice(0, 8)})`);

  state.status = "starting";
  state.reconnectStatus = "idle";
  state.reconnectAttempt = 0;
  state.tabId = tabId;
  state.tabTitle = tabTitle || "Browser Tab";
  state.error = null;
  state.devices = {};
  state.pendingRequests = {};
  broadcastState();

  // 1. Capture Media Stream using streamId
  if (streamId) {
    try {
      capturedStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId
          }
        },
        video: false
      });
    } catch (e) {
      logDiagnostic("CAPTURE", `tabCapture failed with streamId: ${e.message}`, "error");
      throw new Error(`Failed to capture tab audio: ${e.message}`);
    }
  } else {
    throw new Error("No stream ID provided. Make sure to start capture from a regular web page.");
  }

  const audioTrack = capturedStream.getAudioTracks()[0];
  if (!audioTrack) {
    throw new Error("No audio track detected in captured stream.");
  }

  // Handle track ending unexpectedly
  audioTrack.onended = () => {
    logDiagnostic("CAPTURE", "Audio track ended by user or browser tab.", "warn");
    if (!isExplicitlyStopping) {
      state.status = "error";
      state.error = "Tab audio capture stopped. (Tab closed or muted)";
      broadcastState();
      stopStreaming();
    }
  };

  // 2. Setup Web Audio graph for local speaker output + frequency analysis
  setupAudioGraph(capturedStream);

  // 3. Apply Room Data & TURN Credentials
  state.roomId = roomData.roomId;
  state.hostToken = roomData.hostToken;
  state.joinToken = roomData.joinToken;
  state.socketUrl = roomData.socketUrl;
  state.clientUrl = roomData.clientUrl;
  state.pairingUrl = buildPairingUrl(roomData);
  if (Array.isArray(incomingTurnServers) && incomingTurnServers.length > 0) {
    turnServers = incomingTurnServers;
  }

  // 4. Connect WebSocket Signaling as Host
  await connectRelaySocket(roomData.socketUrl, roomData.hostToken, false);

  state.status = "streaming";
  state.reconnectStatus = "idle";
  state.startedAt = Date.now();
  logDiagnostic("SESSION", "Broadcast session is now LIVE.", "info");
  broadcastState();
}

// Stop Streaming & Complete Cleanup
async function stopStreaming() {
  isExplicitlyStopping = true;
  logDiagnostic("SESSION", "Stopping broadcast session and cleaning up resources.", "info");

  // Cancel any pending reconnect timers
  if (socketReconnectTimer) {
    clearTimeout(socketReconnectTimer);
    socketReconnectTimer = null;
  }

  // Close relay socket
  if (relaySocket) {
    try {
      if (relaySocket.readyState === WebSocket.OPEN) {
        relaySocket.send(JSON.stringify({ type: "closeRoom" }));
      }
      relaySocket.close();
    } catch (e) {}
    relaySocket = null;
  }

  // Close and clean all peer connection records
  for (const deviceId in peerRecords) {
    cleanupPeerRecord(deviceId);
  }
  peerRecords = {};

  // Stop media tracks
  if (capturedStream) {
    capturedStream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (e) {}
    });
    capturedStream = null;
  }

  // Close Audio Context
  if (audioContext && audioContext.state !== "closed") {
    try {
      await audioContext.close();
    } catch (e) {}
    audioContext = null;
    sourceNode = null;
    localGainNode = null;
    analyserNode = null;
  }

  state.status = "idle";
  state.reconnectStatus = "idle";
  state.reconnectAttempt = 0;
  state.reconnectNextDelayMs = 0;
  state.tabId = null;
  state.tabTitle = "";
  state.roomId = null;
  state.hostToken = null;
  state.joinToken = null;
  state.socketUrl = null;
  state.clientUrl = null;
  state.pairingUrl = null;
  state.devices = {};
  state.pendingRequests = {};
  state.startedAt = null;

  broadcastState();
}

// Setup Audio Context & Analyser
function setupAudioGraph(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioContext.createMediaStreamSource(stream);

  // Analyser node for real-time spectrum visualization
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 64;
  analyserNode.smoothingTimeConstant = 0.8;
  sourceNode.connect(analyserNode);

  // Local speakers gain
  localGainNode = audioContext.createGain();
  localGainNode.gain.value = state.muteLocal ? 0 : 1;
  sourceNode.connect(localGainNode);
  localGainNode.connect(audioContext.destination);

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function setLocalMute(muted) {
  state.muteLocal = !!muted;
  if (localGainNode) {
    localGainNode.gain.value = state.muteLocal ? 0 : 1;
  }
  logDiagnostic("AUDIO", `Local speaker ${state.muteLocal ? "muted" : "unmuted"}.`, "info");
  broadcastState();
}

// Calculate audio levels for visualization
function getAudioLevels() {
  if (!analyserNode) {
    return { level: 0, spectrum: [] };
  }
  const buffer = new Uint8Array(analyserNode.frequencyBinCount);
  analyserNode.getByteFrequencyData(buffer);

  let sum = 0;
  const spectrum = [];
  const step = Math.max(1, Math.floor(buffer.length / 16));
  for (let i = 0; i < buffer.length; i += step) {
    const val = buffer[i] / 255;
    sum += val;
    spectrum.push(Math.round(val * 100) / 100);
  }
  const avg = sum / (buffer.length / step);
  return { level: Math.round(avg * 100) / 100, spectrum };
}

// Helper to inspect audio track status
function getAudioTrackStatus() {
  if (!capturedStream) return "No captured stream";
  const track = capturedStream.getAudioTracks()[0];
  if (!track) return "No audio track in stream";
  return `Track ${track.id.slice(0, 8)} (${track.readyState}, muted=${track.muted})`;
}

// Format Pairing Link
function buildPairingUrl(roomData) {
  const clientUrl = roomData.clientUrl.replace(/\/$/, "");
  const hash = new URLSearchParams({
    v: "1",
    h: "localhost",
    p: "4040",
    r: roomData.roomId,
    t: roomData.joinToken
  });
  return `${clientUrl}#${hash.toString()}`;
}

// Connect or Reconnect Host WebSocket to Eko Relay
function connectRelaySocket(socketUrl, hostToken, isReconnecting = false) {
  return new Promise((resolve, reject) => {
    if (relaySocket) {
      try {
        relaySocket.close();
      } catch (e) {}
      relaySocket = null;
    }

    let isSettled = false;
    logDiagnostic("RELAY", `${isReconnecting ? "Reconnecting" : "Connecting"} WebSocket to ${socketUrl}...`);

    relaySocket = new WebSocket(socketUrl);

    relaySocket.onopen = () => {
      logDiagnostic("RELAY", "WebSocket opened. Sending host hello authentication...", "info");
      relaySocket.send(JSON.stringify({
        type: "hello",
        role: "host",
        token: hostToken
      }));
    };

    relaySocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleRelayMessage(msg, () => {
          if (!isSettled) {
            isSettled = true;
            resolve();
          }
        });
      } catch (e) {
        logDiagnostic("RELAY", `Message parse error: ${e.message}`, "error");
      }
    };

    relaySocket.onerror = (err) => {
      logDiagnostic("RELAY", "Relay WebSocket error encountered.", "warn");
      if (!isSettled) {
        isSettled = true;
        reject(new Error("Relay socket connection error."));
      }
    };

    relaySocket.onclose = (event) => {
      logDiagnostic("RELAY", `Relay WebSocket closed (code ${event.code}, reason: "${event.reason || "none"}").`, "warn");

      if (!isSettled) {
        isSettled = true;
        reject(new Error(`WebSocket closed before authentication (${event.code})`));
      }

      // If closed unexpectedly while active, trigger smart reconnect!
      if (!isExplicitlyStopping && (state.status === "streaming" || state.status === "reconnecting")) {
        scheduleSocketReconnect(false);
      }
    };
  });
}

// Schedule Socket Reconnect with Exponential Backoff + Jitter
function scheduleSocketReconnect(immediate = false) {
  if (isExplicitlyStopping) return;
  if (state.status !== "streaming" && state.status !== "reconnecting") return;
  if (!state.socketUrl || !state.hostToken) return;

  if (socketReconnectTimer) {
    clearTimeout(socketReconnectTimer);
    socketReconnectTimer = null;
  }

  if (!state.networkOnline) {
    logDiagnostic("RELAY", "Device is offline. Pausing reconnect attempts until network returns.", "warn");
    state.status = "reconnecting";
    state.reconnectStatus = "connection_lost";
    broadcastState();
    return;
  }

  if (state.reconnectAttempt >= MAX_SOCKET_RECONNECT_ATTEMPTS) {
    logDiagnostic("RELAY", `Exceeded maximum relay reconnect attempts (${MAX_SOCKET_RECONNECT_ATTEMPTS}). Terminating.`, "error");
    state.status = "error";
    state.reconnectStatus = "idle";
    state.error = "Relay server connection lost. Maximum reconnect attempts reached.";
    broadcastState();
    return;
  }

  state.status = "reconnecting";
  state.reconnectStatus = "reconnecting";
  state.reconnectAttempt++;

  const delay = immediate ? 0 : calculateBackoffDelay(state.reconnectAttempt - 1);
  state.reconnectNextDelayMs = delay;

  logDiagnostic("RELAY", `Scheduling relay reconnect attempt #${state.reconnectAttempt} in ${delay}ms...`, "info");
  broadcastState();

  socketReconnectTimer = setTimeout(async () => {
    socketReconnectTimer = null;
    await executeSocketReconnect();
  }, delay);
}

// Execute Socket Reconnect
async function executeSocketReconnect() {
  if (isExplicitlyStopping) return;

  try {
    await connectRelaySocket(state.socketUrl, state.hostToken, true);
    logDiagnostic("RELAY", "Relay socket reconnected! Session restored without room recreation.", "info");

    state.status = "streaming";
    state.reconnectStatus = "restored";
    state.reconnectAttempt = 0;
    state.reconnectNextDelayMs = 0;
    state.error = null;
    broadcastState();

    // Reconcile and recover active WebRTC peer connections
    reconcileActivePeersAfterRelayReconnect();

    // After brief 'restored' UI indication, return to 'idle' reconnectStatus
    setTimeout(() => {
      if (state.status === "streaming" && state.reconnectStatus === "restored") {
        state.reconnectStatus = "idle";
        broadcastState();
      }
    }, 3200);
  } catch (err) {
    logDiagnostic("RELAY", `Relay reconnect attempt failed: ${err.message}`, "warn");
    scheduleSocketReconnect(false);
  }
}

// Reconcile peers after relay reconnect
function reconcileActivePeersAfterRelayReconnect() {
  logDiagnostic("WEBRTC", "Reconciling active peer connections after relay reconnect...", "info");
  for (const deviceId in peerRecords) {
    const record = peerRecords[deviceId];
    if (record && record.peer) {
      const connState = record.peer.connectionState;
      logDiagnostic("WEBRTC", `Peer ${deviceId} state after relay recovery: ${connState}`);
      if (connState === "failed" || connState === "disconnected") {
        recoverPeerConnection(deviceId);
      }
    }
  }
}

// Handle Relay Messages
function handleRelayMessage(msg, onReadyResolve) {
  if (msg.type === "ready" && msg.role === "host") {
    logDiagnostic("RELAY", "Host registered and ready with Cloudflare Durable Object room.", "info");
    if (onReadyResolve) onReadyResolve();
    return;
  }

  if (msg.type === "peerLeft" && msg.deviceId) {
    logDiagnostic("RELAY", `Relay reported peer ${msg.deviceId} left the room.`, "info");
    disconnectDevice(msg.deviceId);
    return;
  }

  if (msg.type === "signal" && msg.deviceId && msg.payload) {
    const { deviceId, payload } = msg;

    switch (payload.kind) {
      case "joinRequest":
        handleIncomingJoinRequest(deviceId, payload.request);
        break;

      case "receiverReady":
        handleReceiverReady(deviceId);
        break;

      case "answer":
        handleWebRtcAnswer(deviceId, payload.description);
        break;

      case "iceCandidate":
        handleReceiverIceCandidate(deviceId, payload.candidate);
        break;

      case "clockSyncRequest":
        handleClockSyncRequest(deviceId, payload);
        break;

      case "updateReceiverName":
        if (state.devices[deviceId]) {
          state.devices[deviceId].deviceName = payload.name;
          broadcastState();
        }
        break;
    }
  }
}

// Join Request Handling
function handleIncomingJoinRequest(deviceId, request = {}) {
  const reqInfo = {
    deviceId: deviceId,
    deviceName: request.deviceName || `Device ${deviceId.slice(0, 5)}`,
    method: request.method || "qr",
    requestedAt: Date.now()
  };

  logDiagnostic("JOIN", `Incoming join request from "${reqInfo.deviceName}" (${deviceId})`);

  if (state.autoApprove) {
    logDiagnostic("JOIN", `Auto-approving device ${reqInfo.deviceName}`);
    approveDevice(deviceId, reqInfo);
  } else {
    state.pendingRequests[deviceId] = reqInfo;
    broadcastState();
    chrome.runtime.sendMessage({
      type: "NEW_JOIN_REQUEST",
      request: reqInfo
    }).catch(() => {});
  }
}

// Approve Device
async function approveDevice(deviceId, requestInfo) {
  const info = requestInfo || state.pendingRequests[deviceId] || {
    deviceId,
    deviceName: `Device ${deviceId.slice(0, 5)}`,
    method: "qr"
  };

  delete state.pendingRequests[deviceId];

  state.devices[deviceId] = {
    deviceId,
    deviceName: info.deviceName,
    state: "connecting",
    reconnectStatus: "idle",
    joinedAt: Date.now(),
    stats: { path: "relayed", bitrate: 0 }
  };
  broadcastState();

  // Send permissionChanged (in connecting state so receiver triggers receiverReady)
  sendSignalToReceiver(deviceId, {
    kind: "permissionChanged",
    deviceId,
    state: "connecting",
    session: getEkoSessionPayload()
  });

  // Send webRtcReady
  sendSignalToReceiver(deviceId, {
    kind: "webRtcReady",
    deviceId
  });
}

// Deny Device
function denyDevice(deviceId) {
  delete state.pendingRequests[deviceId];

  sendSignalToReceiver(deviceId, {
    kind: "permissionChanged",
    deviceId,
    state: "denied",
    session: getEkoSessionPayload()
  });

  cleanupPeerRecord(deviceId);
  delete state.devices[deviceId];
  broadcastState();
}

// Disconnect Device
function disconnectDevice(deviceId) {
  cleanupPeerRecord(deviceId);
  delete state.devices[deviceId];
  delete state.pendingRequests[deviceId];
  broadcastState();
}

// Cleanup a single peer record safely
function cleanupPeerRecord(deviceId) {
  const record = peerRecords[deviceId];
  if (!record) return;

  if (record.disconnectTimer) {
    clearTimeout(record.disconnectTimer);
    record.disconnectTimer = null;
  }

  if (record.peer) {
    try {
      record.peer.onconnectionstatechange = null;
      record.peer.oniceconnectionstatechange = null;
      record.peer.onicecandidate = null;
      record.peer.close();
    } catch (e) {}
  }

  delete peerRecords[deviceId];
}

// Receiver Ready -> Create Offer & WebRTC Peer with Resilient Event Handlers
async function handleReceiverReady(deviceId) {
  try {
    // If an existing record exists, clean it up before recreating
    if (peerRecords[deviceId]) {
      cleanupPeerRecord(deviceId);
    }

    logDiagnostic("WEBRTC", `Initializing RTCPeerConnection for device ${deviceId}...`);

    const peer = new RTCPeerConnection({
      iceServers: [...STUN_SERVERS, ...turnServers],
      iceTransportPolicy: "all"
    });

    const record = {
      peer,
      disconnectTimer: null,
      iceRestartAttempts: 0,
      isRestartingIce: false,
      pendingCandidates: []
    };
    peerRecords[deviceId] = record;

    // Attach active tab audio track
    if (capturedStream) {
      const audioTrack = capturedStream.getAudioTracks()[0];
      if (audioTrack) {
        peer.addTrack(audioTrack, capturedStream);
      }
    }

    // ICE Candidate generation
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalToReceiver(deviceId, {
          kind: "hostIceCandidate",
          candidate: {
            deviceId,
            candidate: JSON.stringify(event.candidate.toJSON())
          }
        });
      }
    };

    // Staged WebRTC Connection State Lifecycle
    peer.onconnectionstatechange = () => {
      handlePeerConnectionStateChange(deviceId);
    };

    peer.oniceconnectionstatechange = () => {
      handlePeerIceStateChange(deviceId);
    };

    // Create & send Offer
    const offer = await peer.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });
    await peer.setLocalDescription(offer);

    sendSignalToReceiver(deviceId, {
      kind: "hostOffer",
      description: {
        deviceId,
        sdp: offer.sdp
      }
    });

    sendSignalToReceiver(deviceId, {
      kind: "audioReady",
      deviceId
    });

    sendSignalToReceiver(deviceId, {
      kind: "playbackSchedule",
      playAtServerMs: Date.now() + 40,
      jitterBufferTargetMs: 40
    });
  } catch (err) {
    logDiagnostic("WEBRTC", `Error establishing peer for ${deviceId}: ${err.message}`, "error");
  }
}

// Handle WebRTC Peer Connection State Changes with Grace Period & Recovery
function handlePeerConnectionStateChange(deviceId) {
  const record = peerRecords[deviceId];
  if (!record || !record.peer) return;

  const connState = record.peer.connectionState;
  logDiagnostic("WEBRTC", `Peer ${deviceId} connectionState changed to: ${connState}`);

  const device = state.devices[deviceId];

  switch (connState) {
    case "connected":
      // Connection recovered or established!
      if (record.disconnectTimer) {
        logDiagnostic("WEBRTC", `Peer ${deviceId} recovered to 'connected' before grace period expired. Cancelling recovery.`, "info");
        clearTimeout(record.disconnectTimer);
        record.disconnectTimer = null;
      }
      record.iceRestartAttempts = 0;
      record.isRestartingIce = false;

      if (device) {
        device.state = "connected";
        device.reconnectStatus = "idle";
        sendSignalToReceiver(deviceId, {
          kind: "permissionChanged",
          deviceId,
          state: "connected",
          session: getEkoSessionPayload()
        });
        broadcastState();
      }
      break;

    case "disconnected":
      // Stage A: Temporary disconnection -> Enter 5s grace period
      if (device) {
        device.reconnectStatus = "connection_lost";
        broadcastState();
      }

      if (!record.disconnectTimer) {
        logDiagnostic("WEBRTC", `Peer ${deviceId} disconnected. Starting ${PEER_DISCONNECT_GRACE_MS}ms grace period...`, "warn");
        record.disconnectTimer = setTimeout(() => {
          record.disconnectTimer = null;
          logDiagnostic("WEBRTC", `Peer ${deviceId} remained disconnected after grace period. Initiating recovery...`, "warn");
          recoverPeerConnection(deviceId);
        }, PEER_DISCONNECT_GRACE_MS);
      }
      break;

    case "failed":
      // Immediate recovery required
      if (record.disconnectTimer) {
        clearTimeout(record.disconnectTimer);
        record.disconnectTimer = null;
      }
      logDiagnostic("WEBRTC", `Peer ${deviceId} connection failed. Initiating recovery...`, "warn");
      recoverPeerConnection(deviceId);
      break;

    case "closed":
      cleanupPeerRecord(deviceId);
      delete state.devices[deviceId];
      broadcastState();
      break;
  }
}

// Handle ICE Connection State Changes
function handlePeerIceStateChange(deviceId) {
  const record = peerRecords[deviceId];
  if (!record || !record.peer) return;

  const iceState = record.peer.iceConnectionState;
  logDiagnostic("WEBRTC", `Peer ${deviceId} iceConnectionState: ${iceState}`);

  if (iceState === "failed") {
    recoverPeerConnection(deviceId);
  }
}

// Staged Recovery Strategy for Peer Connection
async function recoverPeerConnection(deviceId) {
  const record = peerRecords[deviceId];
  if (!record || !record.peer) return;

  if (record.isRestartingIce) {
    logDiagnostic("WEBRTC", `Peer ${deviceId} recovery already in progress.`, "info");
    return;
  }

  // Stage B: Attempt ICE Restart
  if (record.iceRestartAttempts < MAX_ICE_RESTARTS) {
    record.iceRestartAttempts++;
    record.isRestartingIce = true;
    logDiagnostic("WEBRTC", `Attempting ICE restart #${record.iceRestartAttempts} for device ${deviceId}...`, "info");

    if (state.devices[deviceId]) {
      state.devices[deviceId].reconnectStatus = "reconnecting";
      broadcastState();
    }

    try {
      record.peer.restartIce();
      const offer = await record.peer.createOffer({ iceRestart: true });
      await record.peer.setLocalDescription(offer);

      sendSignalToReceiver(deviceId, {
        kind: "hostOffer",
        description: {
          deviceId,
          sdp: offer.sdp
        },
        isIceRestart: true
      });
    } catch (err) {
      logDiagnostic("WEBRTC", `ICE restart offer failed for ${deviceId}: ${err.message}`, "error");
      record.isRestartingIce = false;
      // Escalate to Stage D
      recreatePeerForDevice(deviceId);
    }
  } else {
    // Stage D: Max ICE restarts exceeded -> Recreate peer connection for this device only
    logDiagnostic("WEBRTC", `ICE restart attempts exhausted for ${deviceId}. Escalating to peer recreation...`, "warn");
    recreatePeerForDevice(deviceId);
  }
}

// Stage D: Recreate peer connection for single device
async function recreatePeerForDevice(deviceId) {
  cleanupPeerRecord(deviceId);
  if (state.devices[deviceId]) {
    state.devices[deviceId].state = "connecting";
    state.devices[deviceId].reconnectStatus = "reconnecting";
    broadcastState();
  }

  logDiagnostic("WEBRTC", `Recreating clean peer connection for ${deviceId}...`, "info");
  await handleReceiverReady(deviceId);
}

// WebRTC Answer
async function handleWebRtcAnswer(deviceId, description) {
  const record = peerRecords[deviceId];
  if (!record || !record.peer) return;

  try {
    await record.peer.setRemoteDescription(new RTCSessionDescription({
      type: "answer",
      sdp: description.sdp
    }));

    record.isRestartingIce = false;
    logDiagnostic("WEBRTC", `Remote SDP answer applied for ${deviceId}.`, "info");

    // Apply any queued candidates
    if (record.pendingCandidates && record.pendingCandidates.length > 0) {
      for (const cand of record.pendingCandidates.splice(0)) {
        await record.peer.addIceCandidate(cand).catch(console.warn);
      }
    }
  } catch (err) {
    logDiagnostic("WEBRTC", `Failed to set remote description for ${deviceId}: ${err.message}`, "error");
    record.isRestartingIce = false;
  }
}

// Handle ICE Candidate from Receiver
async function handleReceiverIceCandidate(deviceId, candidateMsg) {
  const record = peerRecords[deviceId];
  if (!record || !record.peer) return;

  try {
    const candidateData = JSON.parse(candidateMsg.candidate);
    const iceCand = new RTCIceCandidate(candidateData);

    if (!record.peer.remoteDescription) {
      record.pendingCandidates.push(iceCand);
    } else {
      await record.peer.addIceCandidate(iceCand);
    }
  } catch (err) {
    console.warn(`[eko-offscreen] Error adding ICE candidate for ${deviceId}:`, err);
  }
}

// Clock Sync for synchronized audio
function handleClockSyncRequest(deviceId, payload) {
  const now = Date.now();
  sendSignalToReceiver(deviceId, {
    kind: "clockSyncResponse",
    requestId: payload.requestId,
    clientSentAtMs: payload.clientSentAtMs,
    serverReceivedAtMs: now,
    serverSentAtMs: now
  });
}

// Helper: Send signal to receiver via relay
function sendSignalToReceiver(deviceId, payload) {
  if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
    relaySocket.send(JSON.stringify({
      type: "signal",
      deviceId,
      payload
    }));
  }
}

// Helper: Eko Session Payload
function getEkoSessionPayload() {
  return {
    status: state.status === "streaming" ? "running" : "idle",
    roomId: state.roomId,
    token: state.joinToken,
    host: "localhost",
    port: 4040,
    lanDiscoveryEnabled: false,
    devices: Object.values(state.devices),
    metrics: [],
    events: []
  };
}

// Helper: State Summary for popup & background
function getStateSummary() {
  return {
    status: state.status,
    reconnectStatus: state.reconnectStatus,
    reconnectAttempt: state.reconnectAttempt,
    reconnectNextDelayMs: state.reconnectNextDelayMs,
    networkOnline: state.networkOnline,
    tabId: state.tabId,
    tabTitle: state.tabTitle,
    roomId: state.roomId,
    pairingUrl: state.pairingUrl,
    autoApprove: state.autoApprove,
    muteLocal: state.muteLocal,
    deviceCount: Object.keys(state.devices).length,
    devices: Object.values(state.devices),
    pendingRequests: Object.values(state.pendingRequests),
    startedAt: state.startedAt,
    error: state.error
  };
}

// Broadcast state updates to popup and background
function broadcastState() {
  chrome.runtime.sendMessage({
    type: "STATE_UPDATED",
    state: getStateSummary()
  }).catch(() => {});
}
