// Eko Chrome Extension - Background Service Worker (Manifest V3)
// Coordinates offscreen audio engine, tab capture, relay REST requests, session persistence, and badge status.

const OFFSCREEN_PATH = "offscreen/offscreen.html";

// Ensure Offscreen Document is active
async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  
  if (chrome.runtime.getContexts) {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    if (existing.length > 0) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Captures tab audio and manages peer-to-peer WebRTC streaming for Eko"
    });
  } catch (err) {
    if (!err.message.includes("Only a single offscreen document may be created")) {
      console.error("[eko-bg] Error creating offscreen document:", err);
      throw err;
    }
  }
}

// Forward messages to offscreen document
async function sendToOffscreen(message) {
  await ensureOffscreenDocument();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ ...message, target: "offscreen" }, (response) => {
      resolve(response || { success: false, error: chrome.runtime.lastError?.message });
    });
  });
}

// Create Room via Eko Relay REST API (Service Worker with host_permissions bypasses CORS)
async function createEkoRoom(relayBaseUrl) {
  const url = `${relayBaseUrl.replace(/\/$/, "")}/v1/rooms`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Relay returned status ${response.status}: ${await response.text()}`);
  }

  return await response.json();
}

// Fetch Cloudflare TURN Credentials (Service Worker with host_permissions bypasses CORS)
async function fetchTurnCredentials(relayBaseUrl, roomId, hostToken) {
  try {
    const url = `${relayBaseUrl.replace(/\/$/, "")}/v1/rooms/${roomId}/turn`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${hostToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.iceServers)) {
        return data.iceServers;
      }
    }
  } catch (err) {
    console.warn("[eko-bg] TURN credential fetch error (STUN will still work):", err);
  }
  return [];
}

// Message Listener from Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") return;

  switch (message.type) {
    case "REQUEST_START_STREAM":
      handleStartStream(message.payload)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "REQUEST_STOP_STREAM":
      handleStopStream().then(sendResponse);
      return true;

    case "APPROVE_DEVICE":
    case "DENY_DEVICE":
    case "DISCONNECT_DEVICE":
    case "SET_AUTO_APPROVE":
    case "SET_LOCAL_MUTE":
    case "RESET_ERROR":
    case "GET_STATE":
    case "GET_AUDIO_LEVELS":
    case "GET_DIAGNOSTICS":
    case "TRIGGER_RECONNECT":
      sendToOffscreen(message).then(sendResponse);
      return true;

    case "STATE_UPDATED":
      updateBadge(message.state);
      break;

    case "NEW_JOIN_REQUEST":
      handleJoinNotification(message.request);
      break;
  }
});

// Handle Start Stream
async function handleStartStream(payload = {}) {
  await ensureOffscreenDocument();

  let streamId = payload.streamId;
  let tabId = payload.tabId;
  let tabTitle = payload.tabTitle;
  const relayUrl = payload.relayUrl || "https://eko.allpyq.in";

  if (!tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = activeTab?.id;
    tabTitle = activeTab?.title || "Browser Tab";
  }

  // 1. Service Worker creates room using host_permissions (bypasses browser CORS!)
  const roomData = await createEkoRoom(relayUrl);

  // 2. Service Worker fetches TURN credentials
  const turnServers = await fetchTurnCredentials(relayUrl, roomData.roomId, roomData.hostToken);

  // 3. Forward streamId, roomData, and turnServers to offscreen document
  const result = await sendToOffscreen({
    type: "START_STREAM",
    payload: {
      streamId,
      tabId,
      tabTitle,
      roomData,
      turnServers
    }
  });

  if (result.success && result.state) {
    // Persist active session metadata for MV3 service worker recovery
    chrome.storage.local.set({
      eko_active_session: {
        roomId: roomData.roomId,
        hostToken: roomData.hostToken,
        joinToken: roomData.joinToken,
        socketUrl: roomData.socketUrl,
        clientUrl: roomData.clientUrl,
        tabId,
        tabTitle,
        relayUrl,
        startedAt: Date.now()
      }
    });

    updateBadge(result.state);
  }

  return result;
}

// Handle Stop Stream
async function handleStopStream() {
  const result = await sendToOffscreen({ type: "STOP_STREAM" });
  chrome.storage.local.remove("eko_active_session");
  clearBadge();
  return result;
}

// Update Action Badge based on Streaming Status & Reconnection
function updateBadge(state) {
  if (!state || state.status === "idle" || state.status === "error") {
    clearBadge();
    return;
  }

  if (state.status === "reconnecting" || state.reconnectStatus === "reconnecting" || state.reconnectStatus === "connection_lost") {
    chrome.action.setBadgeText({ text: "..." });
    chrome.action.setBadgeBackgroundColor({ color: "#fca311" }); // Amber Reconnecting
    return;
  }

  if (state.status === "streaming") {
    const count = state.deviceCount || 0;
    const badgeText = count > 0 ? String(count) : "ON";
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: "#2ec4b6" }); // Eko Teal
  }
}

function clearBadge() {
  chrome.action.setBadgeText({ text: "" });
}

// Handle notifications for incoming join requests
function handleJoinNotification(request) {
  chrome.action.setBadgeBackgroundColor({ color: "#ff6b5b" }); // Eko Coral
  chrome.action.setBadgeText({ text: "!" });
}

// Automatically stop stream if the captured tab is closed
chrome.tabs.onRemoved.addListener(async (closedTabId) => {
  try {
    const res = await sendToOffscreen({ type: "GET_STATE" });
    if (res?.state?.tabId === closedTabId) {
      console.info("[eko-bg] Captured tab closed, stopping Eko stream.");
      await handleStopStream();
    }
  } catch (e) {}
});

// Synchronize state when Service Worker starts or restarts
async function syncStateOnWakeup() {
  try {
    const stored = await chrome.storage.local.get("eko_active_session");
    if (stored?.eko_active_session) {
      const res = await sendToOffscreen({ type: "GET_STATE" });
      if (res?.success && res?.state && res.state.status !== "idle") {
        updateBadge(res.state);
      } else {
        chrome.storage.local.remove("eko_active_session");
        clearBadge();
      }
    }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[eko-bg] Eko Audio Share extension installed.");
  clearBadge();
});

chrome.runtime.onStartup.addListener(() => {
  syncStateOnWakeup();
});

// Execute sync check immediately on script execution
syncStateOnWakeup();
