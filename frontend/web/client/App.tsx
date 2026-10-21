import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/button";
import { Toaster } from "@shared/components/ui/sonner";
import { Spinner } from "@shared/components/ui/spinner";
import { useDeviceProfileStore } from "@shared/stores/device-profile-store";
import { parsePairingSource } from "@shared/utils/pairing-link";
import { startWebReceiver, type WebReceiverSession } from "@shared/utils/web-signaling-client";
import { AudioWaveVisualizer } from "@shared/components/receiver/AudioWaveVisualizer";
import { ReceiverCard } from "@shared/components/receiver/ReceiverCard";
import { ReceiverLayout } from "@shared/components/receiver/ReceiverLayout";
import type { JoinRequest } from "@shared/types/device";
import { ConnectionQualityPanel } from "./features/playback/ConnectionQualityPanel";
import type { ConnectionQuality } from "@shared/types/connection-quality";
import { createLiveProfiler, type LiveProfiler } from "./features/playback/live-profiler";
import { useWebBackgroundPlayback } from "./features/playback/web-background-playback";
import type { WebNowPlayingState } from "@shared/types/web-now-playing";
import { formatError } from "@shared/utils/logger";

type ConnectionState = "ready" | "waiting" | "connected" | "failed";

const RECOVERY_COOLDOWN_MS = 15_000;

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
  const [hasJoined, setHasJoined] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<WebReceiverSession | null>(null);
  const wantsPlaybackRef = useRef(true);
  const connectionGenerationRef = useRef(0);
  const shouldRecoverRef = useRef(false);
  const hasAskedRef = useRef(false);
  const reconnectInFlightRef = useRef(false);
  const lastRecoveryAtRef = useRef(0);
  const hasShownRelayWarningRef = useRef(false);

  useEffect(() => {
    if (payload) {
      localStorage.setItem(
        "eko-web-desktop-address",
        `${payload.local.host}:${payload.local.port}`,
      );
    }
  }, [payload]);

  const attachCurrentStream = useCallback(() => {
    if (!audioRef.current || !streamRef.current) {
      return;
    }

    if (audioRef.current.srcObject !== streamRef.current) {
      audioRef.current.srcObject = streamRef.current;
    }
    audioRef.current.autoplay = true;
    audioRef.current.defaultMuted = false;
    audioRef.current.muted = !wantsPlaybackRef.current;
    audioRef.current.volume = 1;

    const track = streamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = true;
    }

    void audioRef.current
      .play()
      .then(() => {
        if (wantsPlaybackRef.current) setIsPlaying(true);
      })
      .catch((error: unknown) => {
        console.warn("[eko] App: audio.play() failed:", error);
        toast.error("Audio playback failed", {
          description: `${formatError(error)} Tap Play to retry browser playback.`,
          duration: 9000,
        });
      });
  }, []);

  const playCurrentStream = useCallback(() => {
    wantsPlaybackRef.current = true;
    attachCurrentStream();
  }, [attachCurrentStream]);

  const pauseCurrentStream = useCallback(() => {
    wantsPlaybackRef.current = false;
    // Keep consuming live media silently so Play cannot resume an old queue.
    if (audioRef.current) audioRef.current.muted = true;
    setIsPlaying(false);
  }, []);

  const connect = useCallback(async () => {
    if (!payload || reconnectInFlightRef.current) {
      return;
    }

    reconnectInFlightRef.current = true;
    const generation = ++connectionGenerationRef.current;
    toast.dismiss();
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.srcObject = null;
    streamRef.current = null;
    setStatus("waiting");
    setStream(null);
    setDesktopMedia(null);
    setIsPlaying(false);
    sessionRef.current?.close();
    setPeer(null);
    setProfiler(null);
    shouldRecoverRef.current = false;
    hasAskedRef.current = true;
    hasShownRelayWarningRef.current = false;

    const savedName = finalReceiverName("web");
    const request = createJoinRequest(deviceId, savedName);
    setHasJoined(true);
    try {
      const session = await startWebReceiver(payload, request, {
        onStatus: () => {},
        onError: (message) => {
          toast.error("Eko connection failed", {
            description: message,
            duration: 9000,
          });
        },
        onConnectionPath: (path) => {
          if (path !== "relay" || hasShownRelayWarningRef.current) {
            return;
          }
          hasShownRelayWarningRef.current = true;
          toast.warning("Relay may add audio delay", {
            description: "Connect both devices to the same Wi-Fi or one mobile hotspot for a shorter path. The improvement depends on the network.",
            duration: 9000,
          });
        },
        onNowPlaying: (media) => {
          setDesktopMedia(media);
        },
        onConnectionLost: (retryable) => {
          if (generation !== connectionGenerationRef.current) return;
          if (!retryable || sessionRef.current?.peer.connectionState !== "connected") setStatus("failed");
          shouldRecoverRef.current = retryable;
          if (!retryable) {
            hasAskedRef.current = false;
            sessionRef.current?.close();
            pauseCurrentStream();
          }
        },
        onStream: (nextStream) => {
          if (generation !== connectionGenerationRef.current) return;
          setStream(nextStream);
          streamRef.current = nextStream;
          attachCurrentStream();
          setStatus("connected");
        },
      });
      if (generation !== connectionGenerationRef.current || !hasAskedRef.current) {
        session.close();
        return;
      }
      sessionRef.current = session;
      setPeer(session.peer);
      setProfiler(
        createLiveProfiler({
          connectionId: createDeviceId(),
          deviceId,
          payload,
          source: "web",
          sendSample: session.sendProfilerSample,
        }),
      );
    } catch (error) {
      if (generation !== connectionGenerationRef.current) return;
      shouldRecoverRef.current = true;
      setStatus("failed");
      console.error(`[eko] App: connect failed:`, error);
      toast.error("Could not connect to Eko", {
        description: formatError(error),
        duration: 9000,
      });
    } finally {
      if (generation === connectionGenerationRef.current) reconnectInFlightRef.current = false;
    }
  }, [deviceId, finalReceiverName, payload, pauseCurrentStream, attachCurrentStream]);

  const recoverConnection = useCallback(() => {
    const session = sessionRef.current;
    const now = Date.now();
    if (
      !hasAskedRef.current ||
      !navigator.onLine ||
      reconnectInFlightRef.current ||
      now - lastRecoveryAtRef.current < RECOVERY_COOLDOWN_MS ||
      (!session && !shouldRecoverRef.current) ||
      (!shouldRecoverRef.current && session && !session.needsReconnect())
    ) {
      return;
    }

    lastRecoveryAtRef.current = now;
    void connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    connectionGenerationRef.current += 1;
    wantsPlaybackRef.current = false;
    sessionRef.current?.close();
    sessionRef.current = null;
    shouldRecoverRef.current = false;
    hasAskedRef.current = false;
    reconnectInFlightRef.current = false;
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
    wantsPlaybackRef,
    desktopMedia,
    onPause: pauseCurrentStream,
    onPlay: playCurrentStream,
    onStop: disconnect,
    onRecover: recoverConnection,
  });

  return (
    <>
      <ReceiverLayout label="Web receiver">
        <ReceiverCard deviceName={deviceName} canEditName={canEditName}
          isConnected={isConnected} isPlaying={isPlaying} hasJoined={hasJoined}
          onNameChange={(name) => setReceiverName("web", name)}
          onNameCommit={() => sessionRef.current?.updateReceiverName(finalReceiverName("web"))}
          onTogglePlay={togglePlay} onDisconnect={disconnect}
          visualizer={<AudioWaveVisualizer stream={stream} isPlaying={isPlaying} className="absolute inset-0" />}>
            <audio
              ref={audioRef}
              className="hidden"
              playsInline
              preload="auto"
              autoPlay
              muted={false}
              onPlaying={() => setIsPlaying(wantsPlaybackRef.current)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            >
              <track kind="captions" label="No captions available" />
            </audio>

            <ConnectionQualityPanel onQuality={writeQuality} peer={isConnected ? peer : null} />

            {isWaiting ? (
              <div className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-sm font-medium text-muted-foreground">
                <Spinner className="size-4" />
                <span>Waiting for the user to accept</span>
              </div>
            ) : !isConnected ? (
              <Button className="h-11" disabled={!payload} onClick={() => { wantsPlaybackRef.current = true; void connect(); }}>
                Ask desktop
              </Button>
            ) : null}
        </ReceiverCard>
      </ReceiverLayout>
      <Toaster position="top-center" closeButton expand={false} visibleToasts={3} />
    </>
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
