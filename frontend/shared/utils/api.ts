import { commands } from "../bindings/tauri";
import { invoke } from "@tauri-apps/api/core";
import type {
  CoreProofStatus,
  DevEvent,
  DiscoveredHost,
  JoinMethod,
  JoinRequest,
  QrPairingPayload,
  RoomSession,
  StartStreamResult,
} from "../bindings/tauri";

type BrowserMockState = {
  session: RoomSession;
  qrPayload: QrPairingPayload | null;
};

const browserMock: BrowserMockState = {
  session: emptySession(),
  qrPayload: null,
};

export function greet(name: string): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.resolve(`Hello, ${name}.`);
  }
  return commands.greet(name);
}

export function startStream(): Promise<StartStreamResult> {
  if (!isTauriRuntime()) {
    const roomId = `room-${createId()}`;
    const token = createId();
    const qrPayload: QrPairingPayload = {
      host: "127.0.0.1",
      port: 44000,
      roomId,
      token,
    };
    browserMock.session = {
      ...emptySession(),
      status: "running",
      roomId,
      token,
      host: qrPayload.host,
      port: qrPayload.port,
      events: [event("info", "Browser preview stream started")],
    };
    browserMock.qrPayload = qrPayload;
    return Promise.resolve({ session: browserMock.session, qrPayload });
  }
  return commands.startStream();
}

export function stopStream(): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    browserMock.session = emptySession();
    browserMock.qrPayload = null;
    return Promise.resolve(browserMock.session);
  }
  return commands.stopStream();
}

export function getRoomSession(): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserMock.session);
  }
  return commands.getRoomSession();
}

export function setLanDiscovery(enabled: boolean): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    browserMock.session = {
      ...browserMock.session,
      lanDiscoveryEnabled: enabled && browserMock.session.status === "running",
    };
    return Promise.resolve(browserMock.session);
  }
  return commands.setLanDiscovery(enabled);
}

export function allowDevice(deviceId: string): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    void deviceId;
    return Promise.resolve(browserMock.session);
  }
  return commands.allowDevice(deviceId);
}

export function denyDevice(deviceId: string): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    void deviceId;
    return Promise.resolve(browserMock.session);
  }
  return commands.denyDevice(deviceId);
}

export function unblockDevice(deviceId: string): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    void deviceId;
    return Promise.resolve(browserMock.session);
  }
  return commands.unblockDevice(deviceId);
}

export function disconnectDevice(deviceId: string): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    void deviceId;
    return Promise.resolve(browserMock.session);
  }
  return commands.disconnectDevice(deviceId);
}

export function setDeviceSharing(deviceId: string, enabled: boolean): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    void deviceId;
    void enabled;
    return Promise.resolve(browserMock.session);
  }
  return commands.setDeviceSharing(deviceId, enabled);
}

export function submitJoinRequest(request: JoinRequest): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    void request;
    return Promise.resolve(browserMock.session);
  }
  return commands.submitJoinRequest(request);
}

export function addDevJoinRequest(deviceName: string, method: JoinMethod): Promise<RoomSession> {
  if (!isTauriRuntime()) {
    const deviceId = `dev-${createId()}`;
    browserMock.session = {
      ...browserMock.session,
      devices: [
        ...browserMock.session.devices,
        {
          deviceId,
          deviceName,
          label: null,
          state: "pending",
          joinMethod: method,
          sharing: "disabled",
          connectedAt: null,
          webRtcState: "waiting",
          iceState: "waiting",
        },
      ],
    };
    return Promise.resolve(browserMock.session);
  }
  return commands.addDevJoinRequest(deviceName, method);
}

export function getCoreProofStatus(): Promise<CoreProofStatus> {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      audio: {
        backend: "browser preview",
        defaultOutputDevice: null,
        captureReady: false,
        note: "Open the Tauri app for native audio capture.",
      },
      discovery: {
        serviceType: "_eko-audio._tcp.local.",
        libraryReady: false,
        note: "Open the Tauri app for LAN discovery.",
      },
      signaling: {
        transport: "WebSocket",
        libraryReady: false,
        note: "Open the Tauri app for Rust signaling.",
      },
      webRtc: {
        mediaTransport: "WebRTC",
        codec: "Opus",
        libraryReady: false,
        note: "Open the Tauri app for native WebRTC.",
      },
    });
  }
  return commands.getCoreProofStatus();
}

export function findNearbyHosts(): Promise<DiscoveredHost[]> {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }
  return commands.findNearbyHosts();
}

export function startNativeReceiver(
  payload: QrPairingPayload,
  request: JoinRequest,
): Promise<void> {
  if (!isTauriRuntime()) {
    void payload;
    void request;
    return Promise.reject(new Error("Native receiver requires the Tauri Android app."));
  }
  return commands.startNativeReceiver(payload, request).then(() => undefined);
}

export function stopNativeReceiver(): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }
  return commands.stopNativeReceiver().then(() => undefined);
}

export function startAndroidMediaSession(): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }
  return invoke<null>("start_android_media_session").then(() => undefined);
}

export function stopAndroidMediaSession(): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }
  return invoke<null>("stop_android_media_session").then(() => undefined);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function emptySession(): RoomSession {
  return {
    status: "idle",
    roomId: null,
    token: null,
    host: null,
    port: null,
    lanDiscoveryEnabled: false,
    devices: [],
    metrics: [],
    events: [],
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Date.now().toString();
}

function event(level: string, message: string): DevEvent {
  const createdAt = Date.now().toString();
  return {
    id: `event-${createdAt}`,
    level,
    message,
    createdAt,
  };
}
