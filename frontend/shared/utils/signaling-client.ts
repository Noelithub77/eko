import type { JoinRequest } from "../types/device";
import type { SignalClientMessage, SignalServerMessage } from "../types/signaling";
import type { QrPairingPayload } from "../types/stream";

export type SignalClient = {
  close: () => void;
  sendReceiverReady: (deviceId: string) => void;
};

export type SignalClientHandlers = {
  onMessage: (message: SignalServerMessage) => void;
  onError: (message: string) => void;
  onClosed: () => void;
};

export function connectToHost(
  payload: QrPairingPayload,
  request: JoinRequest,
  handlers: SignalClientHandlers,
): SignalClient {
  const socket = new WebSocket(`ws://${payload.host}:${payload.port}`);
  let peer: RTCPeerConnection | null = null;
  let audio: HTMLAudioElement | null = null;

  socket.addEventListener("open", () => {
    send(socket, { kind: "joinRequest", request });
  });

  socket.addEventListener("message", async (event) => {
    const message = parseServerMessage(event.data);
    if (message) {
      await handleWebRtcMessage(socket, request.deviceId, message, {
        getPeer: () => peer,
        setPeer: (nextPeer) => {
          peer = nextPeer;
        },
        getAudio: () => audio,
        setAudio: (nextAudio) => {
          audio = nextAudio;
        },
      });
      handlers.onMessage(message);
      return;
    }
    handlers.onError("Could not read host message.");
  });

  socket.addEventListener("error", () => handlers.onError("Connection failed."));
  socket.addEventListener("close", handlers.onClosed);

  return {
    close: () => {
      peer?.close();
      audio?.remove();
      socket.close();
    },
    sendReceiverReady: (deviceId) => send(socket, { kind: "receiverReady", deviceId }),
  };
}

export function parseQrPayload(text: string): QrPairingPayload | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value)) {
      return null;
    }
    const host = getString(value, "host");
    const port = getNumber(value, "port");
    const roomId = getString(value, "roomId");
    const token = getString(value, "token");

    return host && port && roomId && token ? { host, port, roomId, token } : null;
  } catch {
    return null;
  }
}

function send(socket: WebSocket, message: SignalClientMessage) {
  const json = JSON.stringify(message);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(json);
  }
}

type WebRtcState = {
  getPeer: () => RTCPeerConnection | null;
  setPeer: (peer: RTCPeerConnection) => void;
  getAudio: () => HTMLAudioElement | null;
  setAudio: (audio: HTMLAudioElement) => void;
};

async function handleWebRtcMessage(
  socket: WebSocket,
  deviceId: string,
  message: SignalServerMessage,
  state: WebRtcState,
): Promise<void> {
  if (message.kind === "hostOffer") {
    const peer = createReceiverPeer(socket, deviceId, state);
    await peer.setRemoteDescription({ type: "offer", sdp: message.description.sdp });
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    send(socket, {
      kind: "answer",
      description: { deviceId, sdp: answer.sdp ?? "" },
    });
    return;
  }

  if (message.kind === "hostIceCandidate") {
    const peer = state.getPeer();
    const candidate = parseIceCandidate(message.candidate.candidate);
    if (peer && candidate) {
      await peer.addIceCandidate(candidate);
    }
  }
}

function createReceiverPeer(
  socket: WebSocket,
  deviceId: string,
  state: WebRtcState,
): RTCPeerConnection {
  const existing = state.getPeer();
  if (existing) {
    return existing;
  }

  const peer = new RTCPeerConnection();
  peer.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      send(socket, {
        kind: "iceCandidate",
        candidate: {
          deviceId,
          candidate: JSON.stringify(event.candidate.toJSON()),
        },
      });
    }
  });
  peer.addEventListener("track", (event) => {
    const [stream] = event.streams;
    if (!stream) {
      return;
    }
    const audio = state.getAudio() ?? document.createElement("audio");
    audio.autoplay = true;
    audio.controls = false;
    audio.srcObject = stream;
    void audio.play();
    state.setAudio(audio);
  });
  state.setPeer(peer);
  return peer;
}

function parseIceCandidate(text: string): RTCIceCandidateInit | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value)) {
      return null;
    }
    const candidate = getString(value, "candidate");
    if (!candidate) {
      return null;
    }
    const sdpMid = getString(value, "sdpMid");
    const lineIndex = value.sdpMLineIndex;

    return {
      candidate,
      sdpMid: sdpMid ?? undefined,
      sdpMLineIndex: typeof lineIndex === "number" ? lineIndex : undefined,
    };
  } catch {
    return null;
  }
}

function parseServerMessage(data: unknown): SignalServerMessage | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const value: unknown = JSON.parse(data);
    if (!isObject(value)) {
      return null;
    }
    const kind = getString(value, "kind");
    if (!kind) {
      return null;
    }
    return value as SignalServerMessage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === "string" ? item : null;
}

function getNumber(value: Record<string, unknown>, key: string): number | null {
  const item = value[key];
  return typeof item === "number" ? item : null;
}
