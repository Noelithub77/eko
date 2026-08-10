import type { SignalClientMessage } from "@shared/bindings/tauri";
import type { WebNowPlayingState } from "@shared/types/web-now-playing";

const CLOCK_SYNC_SAMPLE_COUNT = 3;
const CLOCK_SYNC_TIMEOUT_MS = 500;
const FALLBACK_START_DELAY_MS = 250;

type ClockSample = {
  offsetMs: number;
  roundTripMs: number;
};

type PendingClockRequest = {
  timeoutId: number;
  resolve: (sample: ClockSample | null) => void;
};

export type PlaybackSyncState = {
  serverOffsetMs: number;
  hasServerOffset: boolean;
  pendingClockRequests: Map<string, PendingClockRequest>;
  pendingStream: MediaStream | null;
  playAtLocalMs: number | null;
  playbackTimerId: number | null;
};

export type PlaybackHandlers = {
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

type SignalSender = (message: SignalClientMessage) => void;

export function createPlaybackSyncState(): PlaybackSyncState {
  return {
    serverOffsetMs: 0,
    hasServerOffset: false,
    pendingClockRequests: new Map(),
    pendingStream: null,
    playAtLocalMs: null,
    playbackTimerId: null,
  };
}

export async function calibrateClock(send: SignalSender, state: PlaybackSyncState): Promise<void> {
  const samples: ClockSample[] = [];
  for (let index = 0; index < CLOCK_SYNC_SAMPLE_COUNT; index += 1) {
    const sample = await measureClock(send, state);
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

export function resolveClockSample(
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

export function scheduleStreamDelivery(state: PlaybackSyncState, handlers: PlaybackHandlers): void {
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

export function clearPlaybackSync(state: PlaybackSyncState): void {
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

export function fallbackPlaybackTime(state: PlaybackSyncState, serverTimeMs: number): number {
  return state.hasServerOffset
    ? serverTimeMs - state.serverOffsetMs
    : Date.now() + FALLBACK_START_DELAY_MS;
}

export function tuneAudioReceivers(peer: RTCPeerConnection, targetMs: number): void {
  for (const receiver of peer.getReceivers()) {
    if (receiver.track.kind === "audio" && "jitterBufferTarget" in receiver) {
      const audioReceiver = receiver as RTCRtpReceiver & { jitterBufferTarget: number | null };
      audioReceiver.jitterBufferTarget = targetMs;
    }
  }
}

function measureClock(send: SignalSender, state: PlaybackSyncState): Promise<ClockSample | null> {
  return new Promise((resolve) => {
    const requestId = createRequestId();
    const clientSentAtMs = Date.now();
    const timeoutId = window.setTimeout(() => {
      state.pendingClockRequests.delete(requestId);
      resolve(null);
    }, CLOCK_SYNC_TIMEOUT_MS);
    state.pendingClockRequests.set(requestId, { timeoutId, resolve });
    send({ kind: "clockSyncRequest", requestId, clientSentAtMs });
  });
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `clock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
