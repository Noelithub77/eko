import type {
  IceCandidateMessage,
  JoinRequest,
  SignalServerMessage,
} from "@shared/bindings/tauri";
import type { PairingLinkPayload } from "@shared/types/pairing-link";
import { logAudioStats } from "@shared/utils/web-rtc-stats";
import {
  calibrateClock,
  clearPlaybackSync,
  createPlaybackSyncState,
  fallbackPlaybackTime,
  type PlaybackHandlers,
  type PlaybackSyncState,
  resolveClockSample,
  scheduleStreamDelivery,
  tuneAudioReceivers,
} from "@shared/utils/web-playback-sync";
import {
  createSignalTransport,
  parseRelayMessage,
  type SignalTransport,
} from "@shared/utils/web-signaling-transport";

const DEFAULT_JITTER_BUFFER_TARGET_MS = 60;
const DIRECT_CONNECTION_ERROR =
  "Couldn’t make a direct connection. This network may block peer-to-peer connections. Try another Wi-Fi network or a phone hotspot.";
const STUN_URLS = ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"];

export type WebReceiverSession = {
  peer: RTCPeerConnection;
  needsReconnect: () => boolean;
  updateReceiverName: (name: string) => void;
  close: () => void;
};

export async function startWebReceiver(
  payload: PairingLinkPayload,
  request: JoinRequest,
  handlers: PlaybackHandlers,
): Promise<WebReceiverSession> {
  const transport = await createSignalTransport(payload, request.deviceId);
  const { socket } = transport;
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: STUN_URLS }],
    iceTransportPolicy: "all",
  });
  let isClosed = false;
  let hasOpened = false;
  let hasJoined = false;
  let joinInFlight = false;
  let canSendCandidates = false;
  let connectionErrorReported = false;
  let messageQueue = Promise.resolve();
  const pendingLocalCandidates: RTCIceCandidateInit[] = [];
  const pendingHostCandidates: IceCandidateMessage[] = [];
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
        reportConnectionError();
      }
      handlers.onConnectionLost();
    }
  };
  peer.oniceconnectionstatechange = () => {
    console.log(`[eko] browser ICE state: ${peer.iceConnectionState}`);
    if (!isClosed && peer.iceConnectionState === "failed") {
      reportConnectionError();
    }
  };

  const statsInterval = window.setInterval(() => logAudioStats(peer), 2000);

  peer.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) {
      return;
    }
    const candidate = event.candidate.toJSON();
    if (!canSendCandidates) {
      pendingLocalCandidates.push(candidate);
      return;
    }
    sendLocalCandidate(transport, request.deviceId, candidate);
  };

  const beginJoin = async (): Promise<void> => {
    if (hasJoined || joinInFlight || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    joinInFlight = true;
    handlers.onStatus("Synchronizing playback.");
    await calibrateClock(transport.send, playbackSync);
    if (socket.readyState === WebSocket.OPEN) {
      hasJoined = true;
      handlers.onStatus("Asking desktop.");
      transport.send({ kind: "joinRequest", request });
    }
    joinInFlight = false;
  };

  socket.addEventListener("message", (event: MessageEvent<string>) => {
    const relay = transport.hosted ? parseRelayMessage(event.data) : null;
    if (relay?.type === "ready") {
      void beginJoin();
      return;
    }
    if (relay?.type === "hostReconnecting") {
      hasJoined = false;
      handlers.onStatus("Desktop is reconnecting.");
      return;
    }
    if (relay?.type === "hostConnected") {
      hasJoined = false;
      handlers.onStatus("Desktop reconnected.");
      void beginJoin();
      return;
    }
    if (relay?.type === "roomClosed") {
      reportError(handlers, "This stream has ended on the desktop.");
      handlers.onConnectionLost();
      return;
    }
    if (relay?.type === "error") {
      reportError(handlers, relay.message);
      return;
    }
    const text = relay?.type === "signal" ? JSON.stringify(relay.payload) : event.data;
    messageQueue = messageQueue
      .then(() =>
        handleServerMessage(
          transport,
          peer,
          request.deviceId,
          text,
          handlers,
          playbackSync,
          pendingHostCandidates,
          pendingLocalCandidates,
          () => {
            canSendCandidates = true;
          },
        ),
      )
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[eko] signaling message failed: ${message}`);
        reportError(handlers, `Could not finish the direct connection: ${message}`);
      });
  });

  socket.addEventListener("close", () => {
    if (!isClosed) {
      const message = hasOpened
        ? "Signaling connection closed before audio connected."
        : "Could not open signaling.";
      reportError(handlers, message);
      handlers.onConnectionLost();
    }
  });

  socket.addEventListener("error", () => {
    reportError(
      handlers,
      transport.hosted
        ? "Hosted pairing is unavailable."
        : "Could not reach the desktop on this local network.",
    );
  });

  hasOpened = true;
  void beginJoin();

  function reportConnectionError(): void {
    if (connectionErrorReported) return;
    connectionErrorReported = true;
    const transportHint = transport.hosted
      ? "Signaling used the hosted relay, but audio still requires a direct WebRTC path."
      : "Local signaling succeeded, but the devices could not establish direct WebRTC media.";
    reportError(handlers, `${DIRECT_CONNECTION_ERROR} ${transportHint}`);
  }

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
      transport.socket.close();
      peer.close();
    },
  };
}

async function handleServerMessage(
  transport: SignalTransport,
  peer: RTCPeerConnection,
  deviceId: string,
  text: string,
  handlers: PlaybackHandlers,
  playbackSync: PlaybackSyncState,
  pendingHostCandidates: IceCandidateMessage[],
  pendingLocalCandidates: RTCIceCandidateInit[],
  markAnswerSent: () => void,
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
      playbackSync.playAtLocalMs = fallbackPlaybackTime(playbackSync, message.playAtServerMs);
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
    reportError(handlers, `The desktop rejected this receiver: ${message.reason}`);
    return;
  }
  if (message.kind === "permissionChanged") {
    if (message.state === "connecting") {
      handlers.onStatus("Connecting audio.");
      transport.send({ kind: "receiverReady", deviceId });
    } else if (message.state === "denied") {
      reportError(handlers, "The desktop denied this receiver.");
    } else if (message.state === "disconnected") {
      reportError(handlers, "The desktop disconnected this receiver.");
      handlers.onConnectionLost();
    }
    return;
  }
  if (message.kind === "hostOffer") {
    await answerOffer(
      transport,
      peer,
      message.description,
      pendingHostCandidates,
      pendingLocalCandidates,
      markAnswerSent,
    );
    return;
  }
  if (message.kind === "hostIceCandidate") {
    if (!peer.remoteDescription) {
      pendingHostCandidates.push(message.candidate);
    } else {
      await addHostCandidate(peer, message.candidate);
    }
    return;
  }
  if (message.kind === "error") {
    reportError(handlers, message.message);
  }
}

async function answerOffer(
  transport: SignalTransport,
  peer: RTCPeerConnection,
  description: { deviceId: string; sdp: string },
  pendingHostCandidates: IceCandidateMessage[],
  pendingLocalCandidates: RTCIceCandidateInit[],
  markAnswerSent: () => void,
): Promise<void> {
  await peer.setRemoteDescription({ type: "offer", sdp: description.sdp });
  for (const candidate of pendingHostCandidates.splice(0)) {
    await addHostCandidate(peer, candidate);
  }
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  const localDescription = peer.localDescription;
  if (localDescription?.sdp) {
    transport.send({
      kind: "answer",
      description: { deviceId: description.deviceId, sdp: localDescription.sdp },
    });
    markAnswerSent();
    for (const candidate of pendingLocalCandidates.splice(0)) {
      sendLocalCandidate(transport, description.deviceId, candidate);
    }
  }
}

function sendLocalCandidate(
  transport: SignalTransport,
  deviceId: string,
  candidate: RTCIceCandidateInit,
): void {
  transport.send({
    kind: "iceCandidate",
    candidate: { deviceId, candidate: JSON.stringify(candidate) },
  });
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

function reportError(handlers: PlaybackHandlers, message: string): void {
  handlers.onError?.(message);
}

function parseServerMessage(text: string): SignalServerMessage | null {
  try {
    return JSON.parse(text) as SignalServerMessage;
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
