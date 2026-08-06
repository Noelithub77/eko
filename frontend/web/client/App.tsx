import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Pencil, Play, X } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent } from "@shared/components/ui/card";
import { Spinner } from "@shared/components/ui/spinner";
import { cn } from "@shared/lib/utils";
import { useDeviceProfileStore } from "@shared/stores/device-profile-store";
import { parsePairingSource } from "@shared/utils/pairing-link";
import { startWebReceiver, type WebReceiverSession } from "@shared/utils/web-signaling-client";
import { AudioWaveVisualizer } from "./components/AudioWaveVisualizer";
import type { JoinRequest } from "@shared/types/device";
import { ConnectionQualityPanel } from "./features/playback/ConnectionQualityPanel";
import type { ConnectionQuality } from "./features/playback/connection-quality";
import { createLiveProfiler, type LiveProfiler } from "./features/playback/live-profiler";
import { useWebBackgroundPlayback } from "./features/playback/web-background-playback";
import type { WebNowPlayingState } from "@shared/bindings/tauri";

type ConnectionState = "ready" | "waiting" | "connected" | "failed";

const AUTO_RECONNECT_STORAGE_KEY = "eko-web-auto-reconnect";
const RECOVERY_COOLDOWN_MS = 3_000;

function App() {
  const payload = useMemo(() => parsePairingSource(window.location.href), []);
  const deviceId = useDeviceProfileStore((state) => state.profiles.web.deviceId);
  const deviceName = useDeviceProfileStore((state) => state.profiles.web.name);
  const setReceiverName = useDeviceProfileStore((state) => state.setReceiverName);
  const finalReceiverName = useDeviceProfileStore((state) => state.finalReceiverName);
  const [status, setStatus] = useState<ConnectionState>(payload ? "ready" : "failed");
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null);
  const [profiler, setProfiler] = useState<LiveProfiler | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [desktopMedia, setDesktopMedia] = useState<WebNowPlayingState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<WebReceiverSession | null>(null);
  const shouldRecoverRef = useRef(false);
  const reconnectInFlightRef = useRef(false);
  const lastRecoveryAtRef = useRef(0);
  const recoverConnectionRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (payload) {
      localStorage.setItem("eko-web-desktop-address", `${payload.host}:${payload.port}`);
    }
  }, [payload]);

  const playCurrentStream = useCallback(() => {
    if (!audioRef.current || !streamRef.current) {
      return;
    }

    audioRef.current.srcObject = streamRef.current;
    audioRef.current.muted = false;

    const track = streamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = true;
    }

    void audioRef.current
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((error: unknown) => {
        console.warn("[eko] App: audio.play() failed:", error);
      });
  }, []);

  const pauseCurrentStream = useCallback(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    audioRef.current.srcObject = null;

    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = false;
    }

    setIsPlaying(false);
  }, []);

  const connect = useCallback(async () => {
    if (!payload || reconnectInFlightRef.current) {
      return;
    }

    reconnectInFlightRef.current = true;
    pauseCurrentStream();
    streamRef.current = null;
    setStatus("waiting");
    setStream(null);
    setDesktopMedia(null);
    setIsPlaying(false);
    sessionRef.current?.close();
    setPeer(null);
    setProfiler(null);
    shouldRecoverRef.current = false;
    localStorage.setItem(AUTO_RECONNECT_STORAGE_KEY, "true");

    const savedName = finalReceiverName("web");
    const request = createJoinRequest(deviceId, savedName);
    setHasJoined(true);
    try {
      const session = await startWebReceiver(payload, request, {
        onStatus: () => {},
        onNowPlaying: (media) => {
          setDesktopMedia(media);
        },
        onConnectionLost: () => {
          shouldRecoverRef.current = true;
          if (document.visibilityState === "visible") {
            window.setTimeout(() => recoverConnectionRef.current(), 0);
          }
        },
        onStream: (nextStream) => {
          for (const track of nextStream.getTracks()) {
            track.addEventListener("mute", () => console.log(`[eko] App: track ${track.id} MUTED`));
            track.addEventListener("unmute", () =>
              console.log(`[eko] App: track ${track.id} UNMUTED readyState=${track.readyState}`),
            );
            track.addEventListener("ended", () =>
              console.log(`[eko] App: track ${track.id} ENDED`),
            );
          }
          setStream(nextStream);
          streamRef.current = nextStream;
          playCurrentStream();
          setTimeout(() => {
            const track = nextStream.getAudioTracks()[0];
            console.log(
              `[eko] App: after 2s — track muted=${track?.muted} readyState=${track?.readyState} enabled=${track?.enabled}`,
            );
          }, 2000);
          setStatus("connected");
        },
      });
      sessionRef.current = session;
      setPeer(session.peer);
      setProfiler(
        createLiveProfiler({
          connectionId: createDeviceId(),
          deviceId,
          payload,
          source: "web",
        }),
      );
    } catch (error) {
      setStatus("failed");
      console.error(`[eko] App: connect failed:`, error);
    } finally {
      reconnectInFlightRef.current = false;
    }
  }, [deviceId, finalReceiverName, payload, pauseCurrentStream, playCurrentStream]);

  const recoverConnection = useCallback(() => {
    const session = sessionRef.current;
    const now = Date.now();
    const wantsReconnect = localStorage.getItem(AUTO_RECONNECT_STORAGE_KEY) === "true";
    if (
      reconnectInFlightRef.current ||
      now - lastRecoveryAtRef.current < RECOVERY_COOLDOWN_MS ||
      (!session && !shouldRecoverRef.current && !wantsReconnect) ||
      (!shouldRecoverRef.current && session && !session.needsReconnect())
    ) {
      return;
    }

    lastRecoveryAtRef.current = now;
    void connect();
  }, [connect]);
  recoverConnectionRef.current = recoverConnection;

  useEffect(() => {
    if (!payload || localStorage.getItem(AUTO_RECONNECT_STORAGE_KEY) !== "true") {
      return;
    }

    void connect();
  }, [connect, payload]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    shouldRecoverRef.current = false;
    reconnectInFlightRef.current = false;
    localStorage.removeItem(AUTO_RECONNECT_STORAGE_KEY);
    setPeer(null);
    setProfiler(null);
    setDesktopMedia(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    setStream(null);
    streamRef.current = null;
    setIsPlaying(false);
    setHasJoined(false);
    setStatus(payload ? "ready" : "failed");
  }, [payload]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pauseCurrentStream();
    } else {
      playCurrentStream();
    }
  }, [isPlaying, pauseCurrentStream, playCurrentStream]);

  const writeQuality = useCallback(
    (quality: ConnectionQuality) => {
      profiler?.writeQuality(quality);
    },
    [profiler],
  );

  const isConnected = status === "connected";
  const isWaiting = status === "waiting";
  const canEditName = hasJoined;

  useWebBackgroundPlayback({
    audioRef,
    isConnected,
    isPlaying,
    desktopMedia,
    onPause: pauseCurrentStream,
    onPlay: playCurrentStream,
    onStop: disconnect,
    onRecover: recoverConnection,
  });

  return (
    <div className="mobile-shell bg-background text-foreground">
      <main className="mx-auto grid min-h-dvh w-full max-w-[430px] content-center gap-3 px-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold leading-tight">Eko</h1>
          <p className="text-sm leading-5 text-muted-foreground">Web receiver</p>
        </div>

        <Card className="gap-4 rounded-2xl py-5 shadow-none">
          <CardContent className="grid gap-4 px-5">
            <div className="grid gap-2 text-sm font-medium">
              <span>Receiver name</span>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  id="web-receiver-name"
                  value={deviceName}
                  onBlur={() => {
                    const next = finalReceiverName("web");
                    sessionRef.current?.updateReceiverName(next);
                    setIsEditingName(false);
                  }}
                  onChange={(event) => setReceiverName("web", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const next = finalReceiverName("web");
                      sessionRef.current?.updateReceiverName(next);
                      setIsEditingName(false);
                    }
                    if (event.key === "Escape") {
                      setIsEditingName(false);
                    }
                  }}
                  maxLength={40}
                  disabled={!canEditName}
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => canEditName && setIsEditingName(true)}
                  disabled={!canEditName}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs transition-colors",
                    canEditName
                      ? "cursor-text hover:bg-accent/50"
                      : "cursor-not-allowed opacity-50",
                  )}
                  aria-label="Edit receiver name"
                >
                  <span className="truncate">{deviceName}</span>
                  <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              )}
            </div>
            <audio ref={audioRef} className="hidden" playsInline preload="auto">
              <track kind="captions" label="No captions available" />
            </audio>

            <div
              className={cn(
                "relative h-32 w-full overflow-hidden rounded-xl bg-black/40 transition-opacity",
                isConnected ? "opacity-100" : "opacity-30",
              )}
            >
              <AudioWaveVisualizer
                stream={stream}
                isPlaying={isPlaying}
                className="absolute inset-0"
              />
              {!isConnected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-white/40">Waiting for audio…</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={!isConnected}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all",
                  isConnected ? "hover:bg-primary/80 active:scale-95" : "opacity-50",
                )}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>

              <button
                type="button"
                onClick={disconnect}
                disabled={!isConnected}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-all",
                  isConnected ? "hover:bg-destructive/90 active:scale-95" : "opacity-50",
                )}
                aria-label="Disconnect"
              >
                <X className="size-4" />
              </button>
            </div>

            <ConnectionQualityPanel onQuality={writeQuality} peer={isConnected ? peer : null} />

            {isWaiting ? (
              <div className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-sm font-medium text-muted-foreground">
                <Spinner className="size-4" />
                <span>Waiting for the user to accept</span>
              </div>
            ) : !isConnected ? (
              <Button className="h-11" disabled={!payload} onClick={() => void connect()}>
                Ask Desktop
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default App;

function createJoinRequest(deviceId: string, deviceName: string): JoinRequest {
  return {
    deviceId,
    deviceName,
    method: "qr",
  };
}

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
