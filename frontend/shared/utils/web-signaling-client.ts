import type {
  IceCandidateMessage,
  JoinRequest,
  SignalClientMessage,
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

const DEFAULT_JITTER_BUFFER_TARGET_MS = 60;
const DIRECT_CONNECTION_ERROR =
  "Couldn’t make a direct connection. This network may block peer-to-peer connections. Try another Wi-Fi network or a phone hotspot.";
const STUN_URLS = ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"];

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
  handlers: PlaybackHandlers,
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
  let joinInFlight = false;
  let canSendCandidates = false;
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
      handlers.onStatus("This stream has ended.");
      handlers.onConnectionLost();
      return;
    }
    if (relay?.type === "error") {
      handlers.onStatus(relay.message);
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
        handlers.onStatus("Could not finish the direct connection.");
      });
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
    handlers.onStatus(message.message);
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
