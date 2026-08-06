import type {
  IceCandidateMessage,
  JoinRequest,
  SignalClientMessage,
  SignalServerMessage,
  WebNowPlayingState,
} from "@shared/bindings/tauri";
import type { PairingLinkPayload } from "@shared/types/pairing-link";

const CLOCK_SYNC_SAMPLE_COUNT = 3;
const CLOCK_SYNC_TIMEOUT_MS = 500;
const DEFAULT_JITTER_BUFFER_TARGET_MS = 60;
const FALLBACK_START_DELAY_MS = 250;

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
  const wsHost = window.location.host;
  const socket = new WebSocket(`ws://${wsHost}/eko`);
  const peer = new RTCPeerConnection();
  let isClosed = false;
  let hasOpened = false;
  const playbackSync = createPlaybackSyncState();

  peer.ontrack = (event: RTCTrackEvent) => {
    console.log(
      `[eko] ontrack: kind=${event.track.kind} id=${event.track.id} streams=${event.streams.length}`,
    );
    tuneAudioReceivers(peer, DEFAULT_JITTER_BUFFER_TARGET_MS);
    const [stream] = event.streams;
    if (stream) {
      console.log(`[eko] stream received: id=${stream.id} tracks=${stream.getTracks().length}`);
      playbackSync.pendingStream = stream;
      scheduleStreamDelivery(playbackSync, handlers);
    }
  };

  peer.onconnectionstatechange = () => {
    console.log(`[eko] browser connection state: ${peer.connectionState}`);
    if (!isClosed && (peer.connectionState === "failed" || peer.connectionState === "closed")) {
      handlers.onConnectionLost();
    }
  };
  peer.oniceconnectionstatechange = () => {
    console.log(`[eko] browser ICE state: ${peer.iceConnectionState}`);
  };

  const statsInterval = setInterval(() => {
    peer
      .getStats()
      .then((stats) => {
        let audioBytes = 0;
        let audioPackets = 0;
        stats.forEach((raw) => {
          const report = raw as Record<string, unknown>;
          if (report.type === "inbound-rtp" && report.kind === "audio") {
            audioBytes += (report.bytesReceived as number) ?? 0;
            audioPackets += (report.packetsReceived as number) ?? 0;
          }
        });
        if (audioBytes > 0 || audioPackets > 0) {
          console.log(`[eko] inbound audio: packets=${audioPackets} bytes=${audioBytes}`);
        }
      })
      .catch(() => {
        /* ignore stats errors */
      });
  }, 2000);

  peer.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) {
      return;
    }
    send(socket, {
      kind: "iceCandidate",
      candidate: {
        deviceId: request.deviceId,
        candidate: JSON.stringify(event.candidate.toJSON()),
      },
    });
  };

  socket.addEventListener("open", () => {
    hasOpened = true;
    handlers.onStatus("Synchronizing playback.");
    void calibrateClock(socket, playbackSync).finally(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      handlers.onStatus("Asking desktop.");
      send(socket, { kind: "joinRequest", request });
    });
  });

  socket.addEventListener("message", (event: MessageEvent<string>) => {
    void handleServerMessage(socket, peer, request.deviceId, event.data, handlers, playbackSync);
  });

  socket.addEventListener("close", () => {
    if (!isClosed) {
      handlers.onStatus(
        hasOpened ? "Desktop connection closed." : "Could not open desktop connection.",
      );
      handlers.onConnectionLost();
    }
  });

  socket.addEventListener("error", () => {
    handlers.onStatus(`Could not reach desktop at ${payload.host}:${payload.port}.`);
    handlers.onConnectionLost();
  });

  return {
    peer,
    needsReconnect: () =>
      !isClosed &&
      (socket.readyState !== WebSocket.OPEN ||
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"),
    updateReceiverName: (name) => {
      send(socket, { kind: "updateReceiverName", deviceId: request.deviceId, name });
    },
    close: () => {
      isClosed = true;
      clearInterval(statsInterval);
      clearPlaybackSync(playbackSync);
      socket.close();
      peer.close();
    },
  };
}

async function handleServerMessage(
  socket: WebSocket,
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
      message.clientSentAtMs === null ||
      message.serverReceivedAtMs === null ||
      message.serverSentAtMs === null
    ) {
      return;
    }

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
    return;
  }

  if (message.kind === "playbackSchedule") {
    if (message.playAtServerMs === null) {
      return;
    }

    playbackSync.playAtLocalMs = playbackSync.hasServerOffset
      ? message.playAtServerMs - playbackSync.serverOffsetMs
      : Date.now() + FALLBACK_START_DELAY_MS;
    tuneAudioReceivers(peer, message.jitterBufferTargetMs);
    scheduleStreamDelivery(playbackSync, handlers);
    return;
  }

  if (message.kind === "nowPlaying") {
    handlers.onNowPlaying(message.media);
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
      send(socket, { kind: "receiverReady", deviceId });
    }
    if (message.state === "denied") {
      handlers.onStatus("Desktop denied this device.");
    }
    return;
  }

  if (message.kind === "hostOffer") {
    await answerOffer(socket, peer, message.description);
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
  socket: WebSocket,
  peer: RTCPeerConnection,
  description: { deviceId: string; sdp: string },
): Promise<void> {
  await peer.setRemoteDescription({ type: "offer", sdp: description.sdp });
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  if (!answer.sdp) {
    return;
  }

  send(socket, {
    kind: "answer",
    description: {
      deviceId: description.deviceId,
      sdp: answer.sdp,
    },
  });
}

async function addHostCandidate(
  peer: RTCPeerConnection,
  candidate: IceCandidateMessage,
): Promise<void> {
  const parsed: unknown = JSON.parse(candidate.candidate);
  if (!isIceCandidateInit(parsed)) {
    return;
  }
  await peer.addIceCandidate(parsed);
}

function send(socket: WebSocket, message: SignalClientMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseServerMessage(text: string): SignalServerMessage | null {
  try {
    return JSON.parse(text) as SignalServerMessage;
  } catch {
    return null;
  }
}

function isIceCandidateInit(value: unknown): value is RTCIceCandidateInit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = (value as { candidate?: unknown }).candidate;
  return typeof candidate === "string";
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

async function calibrateClock(socket: WebSocket, state: PlaybackSyncState): Promise<void> {
  const samples: ClockSample[] = [];

  for (let index = 0; index < CLOCK_SYNC_SAMPLE_COUNT; index += 1) {
    const sample = await measureClock(socket, state);
    if (sample) {
      samples.push(sample);
    }
  }

  const best = samples.sort((left, right) => left.roundTripMs - right.roundTripMs)[0];
  if (!best) {
    return;
  }

  state.serverOffsetMs = best.offsetMs;
  state.hasServerOffset = true;
}

function measureClock(socket: WebSocket, state: PlaybackSyncState): Promise<ClockSample | null> {
  return new Promise((resolve) => {
    const requestId = createRequestId();
    const clientSentAtMs = Date.now();
    const timeoutId = window.setTimeout(() => {
      state.pendingClockRequests.delete(requestId);
      resolve(null);
    }, CLOCK_SYNC_TIMEOUT_MS);

    state.pendingClockRequests.set(requestId, { timeoutId, resolve });
    send(socket, { kind: "clockSyncRequest", requestId, clientSentAtMs });
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
      (message.serverSentAtMs - clientReceivedAtMs)) /
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
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `clock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function tuneAudioReceivers(peer: RTCPeerConnection, targetMs: number): void {
  for (const receiver of peer.getReceivers()) {
    if (receiver.track.kind !== "audio" || !("jitterBufferTarget" in receiver)) {
      continue;
    }

    const audioReceiver = receiver as RTCRtpReceiver & {
      jitterBufferTarget: number | null;
    };
    audioReceiver.jitterBufferTarget = targetMs;
  }
}
