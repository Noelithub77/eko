// Eko Chrome Extension - Robust State Machine & Popup Controller
// Supports Host Broadcasting, Smart Reconnection UI, Real-time Diagnostics, and Resilient Listen Mode.

document.addEventListener("DOMContentLoaded", async () => {
  // UI Elements
  const statusPill = document.getElementById("statusPill");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsDrawer = document.getElementById("settingsDrawer");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const relayUrlInput = document.getElementById("relayUrlInput");

  // Navigation Tabs
  const tabHostBtn = document.getElementById("tabHostBtn");
  const tabListenBtn = document.getElementById("tabListenBtn");
  const hostView = document.getElementById("hostView");
  const listenView = document.getElementById("listenView");

  // Host UI Elements
  const idleSection = document.getElementById("idleSection");
  const streamingSection = document.getElementById("streamingSection");
  const tabIndicatorDot = document.getElementById("tabIndicatorDot");
  const detectedTabTitle = document.getElementById("detectedTabTitle");
  const tabNoticeBanner = document.getElementById("tabNoticeBanner");
  const noticeMessage = document.getElementById("noticeMessage");
  const openSampleSiteBtn = document.getElementById("openSampleSiteBtn");
  const recheckTabBtn = document.getElementById("recheckTabBtn");
  const errorBanner = document.getElementById("errorBanner");
  const errorMessage = document.getElementById("errorMessage");
  const dismissErrorBtn = document.getElementById("dismissErrorBtn");
  const startBroadcastBtn = document.getElementById("startBroadcastBtn");
  const startBtnIcon = document.getElementById("startBtnIcon");
  const startBtnText = document.getElementById("startBtnText");
  const stopBroadcastBtn = document.getElementById("stopBroadcastBtn");
  const streamTimer = document.getElementById("streamTimer");
  const listenerCountText = document.getElementById("listenerCountText");
  const audioVisualizer = document.getElementById("audioVisualizer");
  const qrCanvas = document.getElementById("qrCanvas");
  const copyLinkBtn = document.getElementById("copyLinkBtn");
  const muteLocalToggle = document.getElementById("muteLocalToggle");
  const autoApproveToggle = document.getElementById("autoApproveToggle");
  const pendingRequestsContainer = document.getElementById("pendingRequestsContainer");
  const pendingRequestsList = document.getElementById("pendingRequestsList");
  const listenersList = document.getElementById("listenersList");

  // Receiver UI Elements
  const receiverIdle = document.getElementById("receiverIdle");
  const receiverActive = document.getElementById("receiverActive");
  const pairingInput = document.getElementById("pairingInput");
  const receiverNameInput = document.getElementById("receiverNameInput");
  const joinStreamBtn = document.getElementById("joinStreamBtn");
  const leaveStreamBtn = document.getElementById("leaveStreamBtn");
  const receiverStatusText = document.getElementById("receiverStatusText");
  const receiverAudioElement = document.getElementById("receiverAudioElement");
  const receiverVolumeSlider = document.getElementById("receiverVolumeSlider");
  const resumeAudioBtn = document.getElementById("resumeAudioBtn");

  // Diagnostics UI Elements
  const refreshDiagBtn = document.getElementById("refreshDiagBtn");
  const manualReconnectBtn = document.getElementById("manualReconnectBtn");
  const diagNetworkStatus = document.getElementById("diagNetworkStatus");
  const diagReconnectStatus = document.getElementById("diagReconnectStatus");
  const diagTrackStatus = document.getElementById("diagTrackStatus");
  const diagLogsList = document.getElementById("diagLogsList");

  const toast = document.getElementById("toast");

  // State Management
  // States: 'IDLE' | 'CHECKING_TAB' | 'CAPTURING' | 'CONNECTING' | 'BROADCASTING' | 'ERROR'
  let currentState = "IDLE";
  let activeTabInfo = { id: null, title: "", url: "", isRestricted: false };
  let currentPairingUrl = null;
  let timerInterval = null;
  let visualizerInterval = null;
  let currentDeviceId = getOrCreateDeviceId();

  // Receiver state
  let receiverPeer = null;
  let receiverSocket = null;
  let receiverRetryTimer = null;
  let receiverRetryAttempts = 0;
  let isReceiverExplicitlyStopped = false;
  let activeReceiverParams = null; // { pairingUrlText, receiverName }

  // Load Saved Settings
  const savedSettings = await chrome.storage.local.get(["relayUrl", "autoApprove", "receiverName"]);
  if (savedSettings.relayUrl) relayUrlInput.value = savedSettings.relayUrl;
  if (savedSettings.autoApprove !== undefined) autoApproveToggle.checked = savedSettings.autoApprove;
  if (savedSettings.receiverName) receiverNameInput.value = savedSettings.receiverName;

  // Initialize: Check active tab and sync engine state
  await detectActiveTab();
  await refreshEngineState();

  // Listen for live background state broadcasts
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE_UPDATED" && message.state) {
      handleRemoteStateUpdate(message.state);
    }
  });

  // Dynamically detect tab changes while popup is open
  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
      if (currentState !== "BROADCASTING" && currentState !== "CONNECTING") {
        detectActiveTab();
      }
    });
  }
  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (
        (changeInfo.status === "complete" || changeInfo.title || changeInfo.url) &&
        currentState !== "BROADCASTING" &&
        currentState !== "CONNECTING"
      ) {
        detectActiveTab();
      }
    });
  }

  // Navigation Tab Switching
  tabHostBtn.addEventListener("click", () => switchNavTab("host"));
  tabListenBtn.addEventListener("click", () => switchNavTab("listen"));

  function switchNavTab(tab) {
    if (tab === "host") {
      tabHostBtn.classList.add("active");
      tabListenBtn.classList.remove("active");
      tabHostBtn.setAttribute("aria-selected", "true");
      tabListenBtn.setAttribute("aria-selected", "false");
      hostView.classList.remove("hidden");
      listenView.classList.add("hidden");
    } else {
      tabListenBtn.classList.add("active");
      tabHostBtn.classList.remove("active");
      tabListenBtn.setAttribute("aria-selected", "true");
      tabHostBtn.setAttribute("aria-selected", "false");
      listenView.classList.remove("hidden");
      hostView.classList.add("hidden");
    }
  }

  // Settings Drawer Toggle
  settingsBtn.addEventListener("click", () => {
    settingsDrawer.classList.remove("hidden");
    fetchDiagnostics();
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsDrawer.classList.add("hidden");
    chrome.storage.local.set({ relayUrl: relayUrlInput.value.trim() });
  });

  if (refreshDiagBtn) {
    refreshDiagBtn.addEventListener("click", () => fetchDiagnostics());
  }

  if (manualReconnectBtn) {
    manualReconnectBtn.addEventListener("click", async () => {
      manualReconnectBtn.disabled = true;
      manualReconnectBtn.textContent = "Reconnecting...";
      try {
        await chrome.runtime.sendMessage({ type: "TRIGGER_RECONNECT" });
        showToast("Relay reconnect triggered");
        setTimeout(fetchDiagnostics, 1000);
      } catch (e) {
        showToast("Failed to trigger reconnect");
      } finally {
        setTimeout(() => {
          manualReconnectBtn.disabled = false;
          manualReconnectBtn.textContent = "Test Relay Reconnect";
        }, 2000);
      }
    });
  }

  // Action: Open YouTube in new tab
  openSampleSiteBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
    showToast("Opening YouTube in a new tab...");
  });

  // Action: Re-check active tab
  recheckTabBtn.addEventListener("click", async () => {
    await detectActiveTab(true);
    showToast("Tab status updated");
  });

  // Action: Dismiss Error and reset to clean IDLE state
  dismissErrorBtn.addEventListener("click", () => {
    resetErrorState();
  });

  // Helper: Identify restricted/internal browser URLs
  function isRestrictedUrl(url) {
    if (!url) return true;
    const lower = url.toLowerCase();
    return (
      lower.startsWith("chrome://") ||
      lower.startsWith("chrome-extension://") ||
      lower.startsWith("edge://") ||
      lower.startsWith("about:") ||
      lower.startsWith("view-source:") ||
      lower.includes("chromewebstore.google.com") ||
      lower.includes("chrome.google.com/webstore")
    );
  }

  // Detect and inspect active tab
  async function detectActiveTab(userInitiated = false) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        activeTabInfo = { id: null, title: "No tab detected", url: "", isRestricted: true };
        renderTabStatus();
        return;
      }

      const restricted = isRestrictedUrl(tab.url);
      activeTabInfo = {
        id: tab.id,
        title: tab.title || "Current Tab",
        url: tab.url || "",
        isRestricted: restricted
      };

      renderTabStatus();

      if (!restricted && currentState === "IDLE") {
        hideErrorBanner();
      }
    } catch (err) {
      console.warn("[eko-popup] Tab detection error:", err);
      activeTabInfo = { id: null, title: "Current Tab", url: "", isRestricted: false };
      renderTabStatus();
    }
  }

  // Render Tab Status UI
  function renderTabStatus() {
    if (activeTabInfo.isRestricted) {
      tabIndicatorDot.className = "tab-indicator-dot dot-unsupported";
      detectedTabTitle.textContent = `${activeTabInfo.title} (Unsupported)`;

      noticeMessage.textContent =
        "Chrome blocks audio capture on internal or store pages. Open any website with audio (such as YouTube, Spotify, or Netflix) to broadcast.";
      tabNoticeBanner.classList.remove("hidden");

      if (currentState === "IDLE") {
        statusPill.textContent = "Unsupported Tab";
        statusPill.className = "status-pill status-unsupported";
      }
    } else {
      tabIndicatorDot.className = "tab-indicator-dot dot-active";
      detectedTabTitle.textContent = activeTabInfo.title || "Current Browser Tab";
      tabNoticeBanner.classList.add("hidden");

      if (currentState === "IDLE") {
        statusPill.textContent = "Ready";
        statusPill.className = "status-pill status-ready";
      }
    }
  }

  // Explicit State Machine Transition with Smart Reconnection Pill States
  function setBroadcastState(newState, meta = {}) {
    currentState = newState;

    switch (newState) {
      case "IDLE":
        startBroadcastBtn.disabled = false;
        startBtnIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
        startBtnText.textContent = "Start Broadcast";
        renderTabStatus();
        break;

      case "CHECKING_TAB":
        startBroadcastBtn.disabled = true;
        startBtnText.textContent = "Checking tab...";
        statusPill.textContent = "Checking...";
        statusPill.className = "status-pill status-checking";
        hideErrorBanner();
        break;

      case "CAPTURING":
        startBroadcastBtn.disabled = true;
        startBtnText.textContent = "Acquiring audio...";
        statusPill.textContent = "Capturing...";
        statusPill.className = "status-pill status-connecting";
        break;

      case "CONNECTING":
        startBroadcastBtn.disabled = true;
        startBtnText.textContent = "Connecting relay...";
        statusPill.textContent = "Connecting...";
        statusPill.className = "status-pill status-connecting";
        break;

      case "BROADCASTING":
        startBroadcastBtn.disabled = false;
        idleSection.classList.add("hidden");
        streamingSection.classList.remove("hidden");
        hideErrorBanner();
        tabNoticeBanner.classList.add("hidden");

        // Granular reconnection pills
        updateStatusPillFromReconnectState(meta?.state);
        break;

      case "ERROR":
        startBroadcastBtn.disabled = false;
        startBtnIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
        startBtnText.textContent = "Start Broadcast";
        statusPill.textContent = "Error";
        statusPill.className = "status-pill status-error";
        if (meta.message) {
          showErrorBanner(meta.message);
        }
        break;
    }
  }

  function updateStatusPillFromReconnectState(stateObj) {
    if (!stateObj) return;

    const recStatus = stateObj.reconnectStatus;
    if (recStatus === "connection_lost") {
      statusPill.textContent = "Connection Lost";
      statusPill.className = "status-pill status-lost";
    } else if (recStatus === "reconnecting") {
      const attempt = stateObj.reconnectAttempt || 1;
      statusPill.textContent = `Reconnecting (#${attempt})...`;
      statusPill.className = "status-pill status-reconnecting";
    } else if (recStatus === "restoring_media") {
      statusPill.textContent = "Restoring Audio...";
      statusPill.className = "status-pill status-restoring";
    } else if (recStatus === "restored") {
      statusPill.textContent = "LIVE AGAIN";
      statusPill.className = "status-pill status-live-again";
    } else {
      statusPill.textContent = "LIVE";
      statusPill.className = "status-pill status-live";
    }
  }

  // Error Banner controls
  function showErrorBanner(message) {
    errorMessage.textContent = message;
    errorBanner.classList.remove("hidden");
  }

  function hideErrorBanner() {
    errorBanner.classList.add("hidden");
    errorMessage.textContent = "";
  }

  async function resetErrorState() {
    hideErrorBanner();
    try {
      await chrome.runtime.sendMessage({ type: "RESET_ERROR" });
    } catch (e) {}
    setBroadcastState("IDLE");
    await detectActiveTab();
  }

  // Main Broadcast Click Handler
  startBroadcastBtn.addEventListener("click", async () => {
    if (currentState === "CHECKING_TAB" || currentState === "CAPTURING" || currentState === "CONNECTING") {
      return;
    }

    setBroadcastState("CHECKING_TAB");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      setBroadcastState("ERROR", {
        message: "No active tab detected. Please open a tab and try again."
      });
      return;
    }

    if (isRestrictedUrl(tab.url)) {
      setBroadcastState("IDLE");
      tabNoticeBanner.classList.remove("hidden");
      noticeMessage.textContent = `Cannot capture "${tab.title || "this internal page"}". Please switch to a website with audio (e.g. YouTube or Spotify) to broadcast.`;
      showToast("Please switch to a website with audio first");
      return;
    }

    // Capture tab audio stream ID synchronously within user gesture
    setBroadcastState("CAPTURING");
    let streamId = null;
    try {
      streamId = await new Promise((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!id) {
            reject(new Error("Chrome was unable to provide an audio stream ID for this tab."));
          } else {
            resolve(id);
          }
        });
      });
    } catch (captureErr) {
      console.error("[eko-popup] tabCapture getMediaStreamId failed:", captureErr);
      setBroadcastState("ERROR", {
        message: `Audio capture failed: ${captureErr.message}`
      });
      return;
    }

    // Send streamId to background/offscreen engine
    setBroadcastState("CONNECTING");
    const relayUrl = relayUrlInput.value.trim() || "https://eko.allpyq.in";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "REQUEST_START_STREAM",
        payload: {
          streamId,
          tabId: tab.id,
          tabTitle: tab.title || "Browser Tab",
          relayUrl
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || "Failed to initialize relay broadcast session.");
      }

      showToast("Eko broadcast started!");
      applyStreamingState(response.state);
      setBroadcastState("BROADCASTING", { state: response.state });
    } catch (connErr) {
      console.error("[eko-popup] Connection initialization failed:", connErr);
      setBroadcastState("ERROR", {
        message: `Broadcasting error: ${connErr.message}`
      });
    }
  });

  // Stop Broadcast
  stopBroadcastBtn.addEventListener("click", async () => {
    stopBroadcastBtn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: "REQUEST_STOP_STREAM" });
      showToast("Broadcast stopped");
      cleanupStreamingUI();
      setBroadcastState("IDLE");
    } catch (err) {
      console.error("[eko-popup] Stop error:", err);
    } finally {
      stopBroadcastBtn.disabled = false;
    }
  });

  // Copy Pairing Link
  copyLinkBtn.addEventListener("click", () => {
    if (currentPairingUrl) {
      navigator.clipboard.writeText(currentPairingUrl).then(() => {
        showToast("Pairing link copied to clipboard!");
      });
    }
  });

  // Local Speaker Mute Toggle
  muteLocalToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: "SET_LOCAL_MUTE",
      muted: muteLocalToggle.checked
    });
  });

  // Auto-Approve Toggle
  autoApproveToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: "SET_AUTO_APPROVE",
      enabled: autoApproveToggle.checked
    });
    chrome.storage.local.set({ autoApprove: autoApproveToggle.checked });
  });

  // Query engine state from background
  async function refreshEngineState() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      if (res?.state) {
        handleRemoteStateUpdate(res.state);
      }
    } catch (e) {}
  }

  // Handle remote updates from offscreen engine
  function handleRemoteStateUpdate(state) {
    if (!state) return;

    if (state.status === "streaming" || state.status === "reconnecting") {
      setBroadcastState("BROADCASTING", { state });
      applyStreamingState(state);
    } else if (state.status === "error") {
      setBroadcastState("ERROR", { message: state.error || "Broadcast error occurred" });
    } else {
      if (currentState === "BROADCASTING") {
        cleanupStreamingUI();
      }
      setBroadcastState("IDLE");
    }
  }

  // Apply streaming details to UI
  function applyStreamingState(state) {
    muteLocalToggle.checked = !!state.muteLocal;
    autoApproveToggle.checked = !!state.autoApprove;

    // Timer
    if (state.startedAt && !timerInterval) {
      updateTimerDisplay(state.startedAt);
      timerInterval = setInterval(() => updateTimerDisplay(state.startedAt), 1000);
    }

    // QR Code
    if (state.pairingUrl) {
      if (state.pairingUrl !== currentPairingUrl || !qrCanvas.dataset.rendered) {
        currentPairingUrl = state.pairingUrl;
        if (window.drawQRCode && qrCanvas) {
          try {
            window.drawQRCode(qrCanvas, state.pairingUrl, {
              size: 110,
              padding: 6,
              darkColor: "#0e1217",
              lightColor: "#ffffff"
            });
            qrCanvas.dataset.rendered = "true";
          } catch (qrErr) {
            console.error("[eko-popup] QR code render failed:", qrErr);
          }
        }
      }
    }

    // Devices count & listings
    const count = state.deviceCount || (state.devices ? state.devices.length : 0);
    listenerCountText.textContent = `${count} ${count === 1 ? "listener" : "listeners"}`;

    renderListenersList(state.devices || []);
    renderPendingRequests(state.pendingRequests || []);

    // Update status pill to reflect current reconnect status
    updateStatusPillFromReconnectState(state);

    // Visualizer Loop
    if (!visualizerInterval) {
      visualizerInterval = setInterval(updateVisualizer, 80);
    }
  }

  function cleanupStreamingUI() {
    streamingSection.classList.add("hidden");
    idleSection.classList.remove("hidden");

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (visualizerInterval) {
      clearInterval(visualizerInterval);
      visualizerInterval = null;
    }
    clearVisualizer();
    currentPairingUrl = null;
    if (qrCanvas) delete qrCanvas.dataset.rendered;
  }

  // Update timer display
  function updateTimerDisplay(startedAt) {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const secs = String(elapsedSec % 60).padStart(2, "0");
    streamTimer.textContent = `${mins}:${secs}`;
  }

  // Draw Audio Spectrum Visualizer
  async function updateVisualizer() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_AUDIO_LEVELS" });
      if (!res || !res.levels) return;

      const canvas = audioVisualizer;
      const ctx = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const spectrum = res.levels.spectrum || [];
      const numBars = Math.max(16, spectrum.length);
      const barWidth = width / numBars - 3;

      for (let i = 0; i < numBars; i++) {
        const val = spectrum[i] || 0.05;
        const barHeight = Math.max(4, val * height * 0.95);
        const x = i * (barWidth + 3);
        const y = height - barHeight;

        const gradient = ctx.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, "#ff6b5b");
        gradient.addColorStop(1, "#2ec4b6");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        ctx.fill();
      }
    } catch (e) {}
  }

  function clearVisualizer() {
    const canvas = audioVisualizer;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Render Connected Listeners (Includes Reconnecting states)
  function renderListenersList(devices) {
    if (!devices || devices.length === 0) {
      listenersList.innerHTML = `<div class="empty-list-message">Waiting for listeners to join...</div>`;
      return;
    }

    listenersList.innerHTML = "";
    devices.forEach((dev) => {
      const card = document.createElement("div");
      card.className = "listener-card";

      const isReconnecting = dev.reconnectStatus === "reconnecting" || dev.reconnectStatus === "connection_lost";
      const statusSuffix = isReconnecting ? ` <span style="color:#fca311;font-size:11px;">(reconnecting...)</span>` : "";

      card.innerHTML = `
        <div class="listener-info">
          <div class="listener-dot ${isReconnecting ? "dot-reconnecting" : ""}"></div>
          <span class="listener-name">${escapeHtml(dev.deviceName || dev.deviceId)}${statusSuffix}</span>
        </div>
        <button class="kick-btn" title="Disconnect device" data-id="${dev.deviceId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      card.querySelector(".kick-btn").addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "DISCONNECT_DEVICE",
          deviceId: dev.deviceId
        });
      });

      listenersList.appendChild(card);
    });
  }

  // Render Pending Approval Requests
  function renderPendingRequests(requests) {
    if (!requests || requests.length === 0) {
      pendingRequestsContainer.classList.add("hidden");
      pendingRequestsList.innerHTML = "";
      return;
    }

    pendingRequestsContainer.classList.remove("hidden");
    pendingRequestsList.innerHTML = "";

    requests.forEach((req) => {
      const card = document.createElement("div");
      card.className = "pending-card";
      card.innerHTML = `
        <div class="listener-info">
          <span class="listener-name">${escapeHtml(req.deviceName || "Nearby Phone")}</span>
        </div>
        <div class="pending-actions">
          <button class="btn-small-approve" data-id="${req.deviceId}">Approve</button>
          <button class="btn-small-deny" data-id="${req.deviceId}">Deny</button>
        </div>
      `;

      card.querySelector(".btn-small-approve").addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "APPROVE_DEVICE",
          deviceId: req.deviceId
        });
      });

      card.querySelector(".btn-small-deny").addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "DENY_DEVICE",
          deviceId: req.deviceId
        });
      });

      pendingRequestsList.appendChild(card);
    });
  }

  // Fetch & Render Real-time Diagnostics
  async function fetchDiagnostics() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_DIAGNOSTICS" });
      if (!res) return;

      if (diagNetworkStatus) {
        diagNetworkStatus.textContent = res.networkOnline ? "Online" : "Offline";
        diagNetworkStatus.style.color = res.networkOnline ? "var(--eko-teal)" : "var(--eko-coral)";
      }

      if (diagReconnectStatus) {
        if (res.reconnectStatus === "idle") {
          diagReconnectStatus.textContent = "Normal (Connected)";
          diagReconnectStatus.style.color = "var(--eko-teal)";
        } else {
          diagReconnectStatus.textContent = `${res.reconnectStatus} (#${res.reconnectAttempt || 0})`;
          diagReconnectStatus.style.color = "#fca311";
        }
      }

      if (diagTrackStatus) {
        diagTrackStatus.textContent = res.audioTrackStatus || "Unknown";
      }

      if (diagLogsList && Array.isArray(res.logs)) {
        if (res.logs.length === 0) {
          diagLogsList.innerHTML = `<div class="diag-log-empty">No events logged yet.</div>`;
        } else {
          diagLogsList.innerHTML = res.logs.slice(-15).map(log => {
            const levelClass = log.level === "error" ? "diag-log-error" : log.level === "warn" ? "diag-log-warn" : "";
            return `<div class="diag-log-row ${levelClass}">
              <span class="diag-log-time">${escapeHtml(log.time)}</span>
              <span class="diag-log-tag">[${escapeHtml(log.tag)}]</span>
              <span>${escapeHtml(log.message)}</span>
            </div>`;
          }).join("");
          diagLogsList.scrollTop = diagLogsList.scrollHeight;
        }
      }
    } catch (e) {}
  }

  // ----------------------------------------------------
  // RECEIVER / LISTEN MODE SMART RECONNECTION
  // ----------------------------------------------------
  joinStreamBtn.addEventListener("click", async () => {
    const pairingUrl = pairingInput.value.trim();
    const receiverName = receiverNameInput.value.trim() || "Chrome Listener";
    chrome.storage.local.set({ receiverName });

    if (!pairingUrl) {
      showToast("Please enter a pairing link");
      return;
    }

    joinStreamBtn.disabled = true;
    joinStreamBtn.textContent = "Connecting...";

    isReceiverExplicitlyStopped = false;
    receiverRetryAttempts = 0;
    activeReceiverParams = { pairingUrl, receiverName };

    try {
      await connectReceiverClient(pairingUrl, receiverName);
      receiverIdle.classList.add("hidden");
      receiverActive.classList.remove("hidden");
      showToast("Connected to Eko stream!");
    } catch (err) {
      console.error("[eko-receiver] Join failed:", err);
      showToast(`Connection failed: ${err.message}`);
    } finally {
      joinStreamBtn.disabled = false;
      joinStreamBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Connect & Listen
      `;
    }
  });

  leaveStreamBtn.addEventListener("click", () => {
    isReceiverExplicitlyStopped = true;
    if (receiverRetryTimer) {
      clearTimeout(receiverRetryTimer);
      receiverRetryTimer = null;
    }
    stopListeningToStream();
    receiverActive.classList.add("hidden");
    receiverIdle.classList.remove("hidden");
    if (resumeAudioBtn) resumeAudioBtn.classList.add("hidden");
    showToast("Disconnected from stream");
  });

  receiverVolumeSlider.addEventListener("input", () => {
    receiverAudioElement.volume = parseFloat(receiverVolumeSlider.value);
  });

  if (resumeAudioBtn) {
    resumeAudioBtn.addEventListener("click", () => {
      receiverAudioElement.play().then(() => {
        resumeAudioBtn.classList.add("hidden");
      }).catch(console.warn);
    });
  }

  // Receiver WebRTC Client with Smart Reconnect Loop
  async function connectReceiverClient(pairingUrlText, receiverName) {
    const parsed = parsePairingUrl(pairingUrlText);
    if (!parsed) {
      throw new Error("Invalid Eko pairing link format.");
    }

    // Clean any prior instances
    stopListeningToStream();

    receiverStatusText.textContent = "Connecting to Relay...";

    return new Promise((resolve, reject) => {
      let isSettled = false;

      receiverSocket = new WebSocket(parsed.socketUrl);
      receiverPeer = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }]
      });

      receiverPeer.ontrack = (event) => {
        console.info("[eko-receiver] Received audio stream track");
        receiverAudioElement.srcObject = event.streams[0];
        receiverAudioElement.play().then(() => {
          if (resumeAudioBtn) resumeAudioBtn.classList.add("hidden");
        }).catch((err) => {
          console.warn("[eko-receiver] Autoplay prevented, showing resume button:", err);
          if (resumeAudioBtn) resumeAudioBtn.classList.remove("hidden");
        });

        receiverStatusText.textContent = "Listening to Audio";
        receiverRetryAttempts = 0; // reset retry counter on healthy audio
        if (!isSettled) {
          isSettled = true;
          resolve();
        }
      };

      // Receiver WebRTC State handling with grace period & auto-recovery
      receiverPeer.onconnectionstatechange = () => {
        const state = receiverPeer.connectionState;
        console.log(`[eko-receiver] Peer connectionState: ${state}`);

        if (state === "connected") {
          receiverStatusText.textContent = "Listening to Audio";
          receiverRetryAttempts = 0;
        } else if (state === "disconnected") {
          receiverStatusText.textContent = "Connection lost (recovering...)";
          setTimeout(() => {
            if (!isReceiverExplicitlyStopped && receiverPeer?.connectionState === "disconnected") {
              scheduleReceiverReconnect();
            }
          }, 4000);
        } else if (state === "failed") {
          receiverStatusText.textContent = "Connection failed";
          scheduleReceiverReconnect();
        }
      };

      receiverPeer.onicecandidate = (event) => {
        if (event.candidate && receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
          receiverSocket.send(
            JSON.stringify({
              type: "signal",
              payload: {
                kind: "iceCandidate",
                candidate: {
                  deviceId: currentDeviceId,
                  candidate: JSON.stringify(event.candidate.toJSON())
                }
              }
            })
          );
        }
      };

      receiverSocket.onopen = () => {
        receiverSocket.send(
          JSON.stringify({
            type: "hello",
            role: "receiver",
            token: parsed.joinToken,
            deviceId: currentDeviceId
          })
        );
      };

      receiverSocket.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "ready") {
            receiverStatusText.textContent = "Requesting Approval...";
            receiverSocket.send(
              JSON.stringify({
                type: "signal",
                payload: {
                  kind: "joinRequest",
                  request: {
                    deviceId: currentDeviceId,
                    deviceName: receiverName,
                    method: "qr"
                  }
                }
              })
            );
          }

          if (msg.type === "signal" && msg.payload) {
            const payload = msg.payload;

            if (payload.kind === "permissionChanged") {
              if (payload.state === "connecting" || payload.state === "connected") {
                receiverStatusText.textContent = "Approved! Connecting audio...";
                receiverSocket.send(
                  JSON.stringify({
                    type: "signal",
                    payload: {
                      kind: "receiverReady",
                      deviceId: currentDeviceId
                    }
                  })
                );
              } else if (payload.state === "denied") {
                if (!isSettled) {
                  isSettled = true;
                  reject(new Error("Host denied the join request."));
                }
                isReceiverExplicitlyStopped = true;
                stopListeningToStream();
              }
            }

            if (payload.kind === "webRtcReady") {
              receiverSocket.send(
                JSON.stringify({
                  type: "signal",
                  payload: {
                    kind: "receiverReady",
                    deviceId: currentDeviceId
                  }
                })
              );
            }

            if (payload.kind === "hostOffer" && payload.description) {
              await receiverPeer.setRemoteDescription(
                new RTCSessionDescription({
                  type: "offer",
                  sdp: payload.description.sdp
                })
              );

              const answer = await receiverPeer.createAnswer();
              await receiverPeer.setLocalDescription(answer);

              receiverSocket.send(
                JSON.stringify({
                  type: "signal",
                  payload: {
                    kind: "answer",
                    description: {
                      deviceId: currentDeviceId,
                      sdp: answer.sdp
                    }
                  }
                })
              );
            }

            if (payload.kind === "hostIceCandidate" && payload.candidate) {
              const cand = JSON.parse(payload.candidate.candidate);
              await receiverPeer.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
        } catch (e) {
          console.error("[eko-receiver] Message error:", e);
        }
      };

      receiverSocket.onerror = () => {
        if (!isSettled) {
          isSettled = true;
          reject(new Error("Relay socket connection error"));
        }
      };

      receiverSocket.onclose = () => {
        if (!isReceiverExplicitlyStopped) {
          scheduleReceiverReconnect();
        } else {
          receiverStatusText.textContent = "Disconnected";
        }
      };
    });
  }

  // Schedule Receiver Reconnect with Exponential Backoff
  function scheduleReceiverReconnect() {
    if (isReceiverExplicitlyStopped || !activeReceiverParams) return;
    if (receiverRetryTimer) clearTimeout(receiverRetryTimer);

    if (receiverRetryAttempts >= 8) {
      receiverStatusText.textContent = "Connection lost. Reconnect exhausted.";
      showToast("Receiver connection lost.");
      return;
    }

    receiverRetryAttempts++;
    const delay = Math.min(
      15000,
      Math.round(1000 * Math.pow(1.8, receiverRetryAttempts - 1) * (1 + (Math.random() * 0.4 - 0.2)))
    );

    receiverStatusText.textContent = `Reconnecting (attempt #${receiverRetryAttempts} in ${Math.round(delay / 1000)}s)...`;

    receiverRetryTimer = setTimeout(async () => {
      receiverRetryTimer = null;
      if (!isReceiverExplicitlyStopped && activeReceiverParams) {
        try {
          await connectReceiverClient(activeReceiverParams.pairingUrl, activeReceiverParams.receiverName);
        } catch (e) {
          scheduleReceiverReconnect();
        }
      }
    }, delay);
  }

  function stopListeningToStream() {
    if (receiverSocket) {
      try {
        receiverSocket.close();
      } catch (e) {}
      receiverSocket = null;
    }
    if (receiverPeer) {
      try {
        receiverPeer.onconnectionstatechange = null;
        receiverPeer.onicecandidate = null;
        receiverPeer.ontrack = null;
        receiverPeer.close();
      } catch (e) {}
      receiverPeer = null;
    }
    if (receiverAudioElement) {
      receiverAudioElement.srcObject = null;
    }
  }

  function parsePairingUrl(urlStr) {
    try {
      const url = new URL(urlStr);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const roomId = hash.get("r");
      const joinToken = hash.get("t");
      if (!roomId || !joinToken) return null;

      const socketOrigin = url.origin.replace(/^http/, "ws");
      return {
        roomId,
        joinToken,
        socketUrl: `${socketOrigin}/v1/rooms/${roomId}/socket`
      };
    } catch (e) {
      return null;
    }
  }

  // Toast System
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 3200);
  }

  // Device ID persistence
  function getOrCreateDeviceId() {
    let id = localStorage.getItem("eko_device_id");
    if (!id) {
      id = "chrome-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("eko_device_id", id);
    }
    return id;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }
});
