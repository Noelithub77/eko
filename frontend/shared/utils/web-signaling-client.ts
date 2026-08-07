import type {
  IceCandidateMessage,
  JoinRequest,
  SignalClientMessage,
  SignalServerMessage,
} from "@shared/bindings/tauri";
import type { PairingLinkPayload } from "@shared/types/pairing-link";
import type { WebNowPlayingState } from "@shared/types/web-now-playing";
import { logAudioStats } from "@shared/utils/web-rtc-stats";

const CLOCK_SYNC_SAMPLE_COUNT = 3;
const CLOCK_SYNC_TIMEOUT_MS = 500;
const DEFAULT_JITTER_BUFFER_TARGET_MS = 60;
const FALLBACK_START_DELAY_MS = 250;
const DIRECT_CONNECTION_ERROR =
  "Couldn’t make a direct connection. This network may block peer-to-peer connections. Try another Wi-Fi network or a phone hotspot.";
const STUN_URLS = ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"];

type ClockSample = {
  offsetMs: number;
  roundTripMs: number;
};

type PendingClockRequest = {
  timeoutId: number;
  resolve: (sample: ClockSample | null) => void;
};

type PlaybackSyncState = {
  serverOffsetMs: number;
  hasServerOffset: boolean;
  pendingClockRequests: Map<string, PendingClockRequest>;
  pendingStream: MediaStream | null;
  playAtLocalMs: number | null;
  playbackTimerId: number | null;
};

type WebReceiverHandlers = {
  onStatus: (message: string) => void;
  onStream: (stream: MediaStream) => void;
  onNowPlaying: (media: WebNowPlayingState | null) => void;
  onConnectionLost: () => void;
};

type ValidClockSyncResponse = {
  kind: "clockSyncResponse";
  requestId: string;
  clientSentAtMs: number;
  serverReceivedAtMs: number;
  serverSentAtMs: number;
};

type RelayServerMessage =
  | { type: "ready"; role: "host" | "receiver" }
  | { type: "signal"; deviceId: string; payload: unknown }
  | { type: "hostReconnecting" }
  | { type: "hostConnected" }
  | { type: "roomClosed" }
  | { type: "error"; message: string };

type SignalTransport = {
  socket: WebSocket;
  hosted: boolean;
  send: (message: SignalClientMessage) => void;
};

export type WebReceiverSession = {
  peer: RTCPeerConnection;
  needsReconnect: () => boolean;
  updateReceiverName: (name: string) => void;
  close: () => void;
};

export async function startWebReceiver(
  payload: PairingLinkPayload,
  request: JoinRequest,
  handlers: WebReceiverHandlers,
): Promise<WebReceiverSession> {
  const transport = createTransport(payload);
  const { socket } = transport;
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: STUN_URLS }],
    iceTransportPolicy: "all",
  });
  let isClosed = false;
  let hasOpened = false;
  let hasJoined = false;
  const playbackSync = createPlaybackSyncState();

  peer.ontrack = (event: RTCTrackEvent) => {
    tuneAudioReceivers(peer, DEFAULT_JITTER_BUFFER_TARGET_MS);
    const [stream] = event.streams;
    if (stream) {
      playbackSync.pendingStream = stream;
      scheduleStreamDelivery(playbackSync, handlers);
    }
  };

  peer.onconnectionstatechange = () => {
    console.log(`[eko] browser connection state: ${peer.connectionState}`);
    if (!isClosed && (peer.connectionState === "failed" || peer.connectionState === "closed")) {
      if (peer.connectionState === "failed") {
        handlers.onStatus(DIRECT_CONNECTION_ERROR);
      }
      handlers.onConnectionLost();
    }
  };
  peer.oniceconnectionstatechange = () => {
    console.log(`[eko] browser ICE state: ${peer.iceConnectionState}`);
    if (!isClosed && peer.iceConnectionState === "failed") {
      handlers.onStatus(DIRECT_CONNECTION_ERROR);
    }
  };

  const statsInterval = window.setInterval(() => logAudioStats(peer), 2000);

  peer.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) {
      return;
    }
    transport.send({
      kind: "iceCandidate",
      candidate: {
        deviceId: request.deviceId,
        candidate: JSON.stringify(event.candidate.toJSON()),
      },
    });
  };

  const beginJoin = async (): Promise<void> => {
    if (hasJoined || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    hasJoined = true;
    handlers.onStatus("Synchronizing playback.");
    await calibrateClock(transport, playbackSync);
    if (socket.readyState === WebSocket.OPEN) {
      handlers.onStatus("Asking desktop.");
      transport.send({ kind: "joinRequest", request });
    }
  };

  socket.addEventListener("open", () => {
    hasOpened = true;
    if (transport.hosted && payload.hosted) {
      socket.send(
        JSON.stringify({
          type: "hello",
          role: "receiver",
          token: payload.hosted.joinToken,
          deviceId: request.deviceId,
        }),
      );
      return;
    }
    void beginJoin();
  });

  socket.addEventListener("message", (event: MessageEvent<string>) => {
    const relay = transport.hosted ? parseRelayMessage(event.data) : null;
    if (relay?.type === "ready") {
      void beginJoin();
      return;
    }
    if (relay?.type === "hostReconnecting") {
      handlers.onStatus("Desktop is reconnecting.");
      return;
    }
    if (relay?.type === "hostConnected") {
      handlers.onStatus("Desktop reconnected.");
      return;
    }
    if (relay?.type === "roomClosed") {
      handlers.onStatus("This stream has ended.");
      handlers.onConnectionLost();
      return;
    }
    if (relay?.type === "error") {
      handlers.onStatus(relay.message);
      return;
    }
    const text = relay?.type === "signal" ? JSON.stringify(relay.payload) : event.data;
    void handleServerMessage(transport, peer, request.deviceId, text, handlers, playbackSync);
  });

  socket.addEventListener("close", () => {
    if (!isClosed) {
      handlers.onStatus(hasOpened ? "Signaling connection closed." : "Could not open signaling.");
      handlers.onConnectionLost();
    }
  });

  socket.addEventListener("error", () => {
    handlers.onStatus(
      transport.hosted
        ? "Hosted pairing is unavailable."
        : "Could not reach desktop on this network.",
    );
  });

  return {
    peer,
    needsReconnect: () =>
      !isClosed &&
      (socket.readyState !== WebSocket.OPEN ||
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"),
    updateReceiverName: (name) => {
      transport.send({ kind: "updateReceiverName", deviceId: request.deviceId, name });
    },
    close: () => {
      isClosed = true;
      window.clearInterval(statsInterval);
      clearPlaybackSync(playbackSync);
      socket.close();
      peer.close();
    },
  };
}

function createTransport(payload: PairingLinkPayload): SignalTransport {
  const hosted = payload.hosted !== null;
  const socketUrl =
    payload.hosted?.socketUrl ?? `ws://${payload.local.host}:${payload.local.port}/eko`;
  const socket = new WebSocket(socketUrl);
  return {
    socket,
    hosted,
    send: (message) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify(hosted ? { type: "signal", payload: message } : message));
    },
  };
}

async function handleServerMessage(
  transport: SignalTransport,
  peer: RTCPeerConnection,
  deviceId: string,
  text: string,
  handlers: WebReceiverHandlers,
  playbackSync: PlaybackSyncState,
): Promise<void> {
  const message = parseServerMessage(text);
  if (!message) {
    return;
  }

  if (message.kind === "clockSyncResponse") {
    if (
      message.clientSentAtMs !== null &&
      message.serverReceivedAtMs !== null &&
      message.serverSentAtMs !== null
    ) {
      resolveClockSample(
        playbackSync,
        {
          ...message,
          clientSentAtMs: message.clientSentAtMs,
          serverReceivedAtMs: message.serverReceivedAtMs,
          serverSentAtMs: message.serverSentAtMs,
        },
        Date.now(),
      );
    }
    return;
  }

  if (message.kind === "playbackSchedule") {
    if (message.playAtServerMs !== null) {
      playbackSync.playAtLocalMs = playbackSync.hasServerOffset
        ? message.playAtServerMs - playbackSync.serverOffsetMs
        : Date.now() + FALLBACK_START_DELAY_MS;
      tuneAudioReceivers(peer, message.jitterBufferTargetMs);
      scheduleStreamDelivery(playbackSync, handlers);
    }
    return;
  }

  if (message.kind === "approvalWaiting") {
    handlers.onStatus("Waiting for desktop approval.");
    return;
  }
  if (message.kind === "joinRejected") {
    handlers.onStatus(message.reason);
    return;
  }
  if (message.kind === "permissionChanged") {
    if (message.state === "connecting") {
      handlers.onStatus("Connecting audio.");
      transport.send({ kind: "receiverReady", deviceId });
    } else if (message.state === "denied") {
      handlers.onStatus("Desktop denied this device.");
    }
    return;
  }
  if (message.kind === "hostOffer") {
    await answerOffer(transport, peer, message.description);
    return;
  }
  if (message.kind === "hostIceCandidate") {
    await addHostCandidate(peer, message.candidate);
    return;
  }
  if (message.kind === "error") {
    handlers.onStatus(message.message);
  }
}

async function answerOffer(
  transport: SignalTransport,
  peer: RTCPeerConnection,
  description: { deviceId: string; sdp: string },
): Promise<void> {
  await peer.setRemoteDescription({ type: "offer", sdp: description.sdp });
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  if (answer.sdp) {
    transport.send({
      kind: "answer",
      description: { deviceId: description.deviceId, sdp: answer.sdp },
    });
  }
}

async function addHostCandidate(
  peer: RTCPeerConnection,
  candidate: IceCandidateMessage,
): Promise<void> {
  const parsed: unknown = JSON.parse(candidate.candidate);
  if (isIceCandidateInit(parsed)) {
    await peer.addIceCandidate(parsed);
  }
}

function parseServerMessage(text: string): SignalServerMessage | null {
  try {
    return JSON.parse(text) as SignalServerMessage;
  } catch {
    return null;
  }
}

function parseRelayMessage(text: string): RelayServerMessage | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || !("type" in value)) {
      return null;
    }
    const message = value as Record<string, unknown>;
    if (message.type === "signal" && typeof message.deviceId === "string") {
      return { type: "signal", deviceId: message.deviceId, payload: message.payload };
    }
    if (message.type === "ready" && (message.role === "host" || message.role === "receiver")) {
      return { type: "ready", role: message.role };
    }
    if (
      message.type === "hostReconnecting" ||
      message.type === "hostConnected" ||
      message.type === "roomClosed"
    ) {
      return { type: message.type };
    }
    if (message.type === "error" && typeof message.message === "string") {
      return { type: "error", message: message.message };
    }
    return null;
  } catch {
    return null;
  }
}

function isIceCandidateInit(value: unknown): value is RTCIceCandidateInit {
  return (
    typeof value === "object" &&
    value !== null &&
    "candidate" in value &&
    typeof value.candidate === "string"
  );
}

function createPlaybackSyncState(): PlaybackSyncState {
  return {
    serverOffsetMs: 0,
    hasServerOffset: false,
    pendingClockRequests: new Map(),
    pendingStream: null,
    playAtLocalMs: null,
    playbackTimerId: null,
  };
}

async function calibrateClock(transport: SignalTransport, state: PlaybackSyncState): Promise<void> {
  const samples: ClockSample[] = [];
  for (let index = 0; index < CLOCK_SYNC_SAMPLE_COUNT; index += 1) {
    const sample = await measureClock(transport, state);
    if (sample) {
      samples.push(sample);
    }
  }
  const best = samples.sort((left, right) => left.roundTripMs - right.roundTripMs)[0];
  if (best) {
    state.serverOffsetMs = best.offsetMs;
    state.hasServerOffset = true;
  }
}

function measureClock(
  transport: SignalTransport,
  state: PlaybackSyncState,
): Promise<ClockSample | null> {
  return new Promise((resolve) => {
    const requestId = createRequestId();
    const clientSentAtMs = Date.now();
    const timeoutId = window.setTimeout(() => {
      state.pendingClockRequests.delete(requestId);
      resolve(null);
    }, CLOCK_SYNC_TIMEOUT_MS);
    state.pendingClockRequests.set(requestId, { timeoutId, resolve });
    transport.send({ kind: "clockSyncRequest", requestId, clientSentAtMs });
  });
}

function resolveClockSample(
  state: PlaybackSyncState,
  message: ValidClockSyncResponse,
  clientReceivedAtMs: number,
): void {
  const pending = state.pendingClockRequests.get(message.requestId);
  if (!pending) {
    return;
  }
  window.clearTimeout(pending.timeoutId);
  state.pendingClockRequests.delete(message.requestId);
  const serverProcessingMs = message.serverSentAtMs - message.serverReceivedAtMs;
  const roundTripMs = Math.max(0, clientReceivedAtMs - message.clientSentAtMs - serverProcessingMs);
  const offsetMs =
    (message.serverReceivedAtMs -
      message.clientSentAtMs +
      message.serverSentAtMs -
      clientReceivedAtMs) /
    2;
  pending.resolve({ offsetMs, roundTripMs });
}

function scheduleStreamDelivery(state: PlaybackSyncState, handlers: WebReceiverHandlers): void {
  if (!state.pendingStream) {
    return;
  }
  if (state.playbackTimerId !== null) {
    window.clearTimeout(state.playbackTimerId);
  }
  const delayMs =
    state.playAtLocalMs === null
      ? FALLBACK_START_DELAY_MS
      : Math.max(0, state.playAtLocalMs - Date.now());
  state.playbackTimerId = window.setTimeout(() => {
    const stream = state.pendingStream;
    state.pendingStream = null;
    state.playbackTimerId = null;
    if (stream) {
      handlers.onStream(stream);
    }
  }, delayMs);
}

function clearPlaybackSync(state: PlaybackSyncState): void {
  if (state.playbackTimerId !== null) {
    window.clearTimeout(state.playbackTimerId);
    state.playbackTimerId = null;
  }
  for (const pending of state.pendingClockRequests.values()) {
    window.clearTimeout(pending.timeoutId);
    pending.resolve(null);
  }
  state.pendingClockRequests.clear();
  state.pendingStream = null;
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `clock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function tuneAudioReceivers(peer: RTCPeerConnection, targetMs: number): void {
  for (const receiver of peer.getReceivers()) {
    if (receiver.track.kind === "audio" && "jitterBufferTarget" in receiver) {
      const audioReceiver = receiver as RTCRtpReceiver & { jitterBufferTarget: number | null };
      audioReceiver.jitterBufferTarget = targetMs;
    }
  }
}
