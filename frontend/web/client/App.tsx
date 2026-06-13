import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { NetworkBadge } from "@shared/components/NetworkBadge";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { Input } from "@shared/components/ui/input";
import { Slider } from "@shared/components/ui/slider";
import { cn } from "@shared/lib/utils";
import { useDeviceProfileStore } from "@shared/stores/device-profile-store";
import { parsePairingSource } from "@shared/utils/pairing-link";
import { startWebReceiver, type WebReceiverSession } from "@shared/utils/web-signaling-client";
import { AudioWaveVisualizer } from "./components/AudioWaveVisualizer";
import type { JoinRequest } from "@shared/types/device";
import { ConnectionQualityPanel } from "./features/playback/ConnectionQualityPanel";
import type { ConnectionQuality } from "./features/playback/connection-quality";
import { createLiveProfiler, type LiveProfiler } from "./features/playback/live-profiler";

type ConnectionState = "ready" | "waiting" | "connected" | "failed";

function App() {
  const payload = useMemo(() => parsePairingSource(window.location.href), []);
  const deviceId = useDeviceProfileStore((state) => state.profiles.web.deviceId);
  const deviceName = useDeviceProfileStore((state) => state.profiles.web.name);
  const setReceiverName = useDeviceProfileStore((state) => state.setReceiverName);
  const finalReceiverName = useDeviceProfileStore((state) => state.finalReceiverName);
  const [status, setStatus] = useState<ConnectionState>(payload ? "ready" : "failed");
  const [message, setMessage] = useState(
    payload ? "Ready to ask the desktop." : "This link is missing pairing data.",
  );
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null);
  const [profiler, setProfiler] = useState<LiveProfiler | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<WebReceiverSession | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startElapsedTimer = useCallback(() => {
    setElapsed(0);
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
    }
    elapsedTimerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (payload) {
      localStorage.setItem("eko-web-desktop-address", `${payload.host}:${payload.port}`);
    }
  }, [payload]);

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
    };
  }, []);

  const connect = useCallback(async () => {
    if (!payload) {
      return;
    }

    setStatus("waiting");
    setMessage("Asking desktop.");
    setStream(null);
    setIsPlaying(false);
    stopElapsedTimer();
    sessionRef.current?.close();
    setPeer(null);
    setProfiler(null);

    const savedName = finalReceiverName("web");
    const request = createJoinRequest(deviceId, savedName);
    try {
      const session = await startWebReceiver(payload, request, {
        onStatus: (nextMessage) => setMessage(nextMessage),
        onStream: (nextStream) => {
          console.log(
            `[eko] App: onStream called, stream id=${nextStream.id} active=${nextStream.active} tracks=${nextStream.getTracks().length}`,
          );
          for (const track of nextStream.getTracks()) {
            console.log(
              `[eko] App: stream track kind=${track.kind} id=${track.id} enabled=${track.enabled} muted=${track.muted} readyState=${track.readyState}`,
            );
            track.addEventListener("mute", () => console.log(`[eko] App: track ${track.id} MUTED`));
            track.addEventListener("unmute", () =>
              console.log(`[eko] App: track ${track.id} UNMUTED readyState=${track.readyState}`),
            );
            track.addEventListener("ended", () =>
              console.log(`[eko] App: track ${track.id} ENDED`),
            );
          }
          setStream(nextStream);
          if (audioRef.current) {
            console.log(
              `[eko] App: audio element found, paused=${audioRef.current.paused} srcObject=${!!audioRef.current.srcObject}`,
            );
            audioRef.current.srcObject = nextStream;
            audioRef.current.muted = false;
            audioRef.current
              .play()
              .then(() => {
                console.log(`[eko] App: audio.play() succeeded`);
                setIsPlaying(true);
                startElapsedTimer();
              })
              .catch((err) => {
                console.warn(`[eko] App: audio.play() failed:`, err);
              });
            setTimeout(() => {
              const t = nextStream.getAudioTracks()[0];
              console.log(
                `[eko] App: after 2s — track muted=${t?.muted} readyState=${t?.readyState} enabled=${t?.enabled}`,
              );
            }, 2000);
          } else {
            console.warn(`[eko] App: audioRef.current is null — audio element not mounted`);
          }
          setStatus("connected");
          setMessage("Connected.");
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
      setMessage(error instanceof Error ? error.message : "Could not start web receiver.");
    }
  }, [deviceId, finalReceiverName, payload, startElapsedTimer, stopElapsedTimer]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setPeer(null);
    setProfiler(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    setStream(null);
    setIsPlaying(false);
    stopElapsedTimer();
    setStatus(payload ? "ready" : "failed");
    setMessage(payload ? "Ready to ask the desktop." : "This link is missing pairing data.");
  }, [payload, stopElapsedTimer]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    } else {
      void audioRef.current.play().then(() => {
        setIsPlaying(true);
        elapsedTimerRef.current = setInterval(() => {
          setElapsed((prev) => prev + 1);
        }, 1000);
      });
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const writeQuality = useCallback(
    (quality: ConnectionQuality) => {
      profiler?.writeQuality(quality);
    },
    [profiler],
  );

  return (
    <div className="mobile-shell bg-background text-foreground">
      <main className="mx-auto grid min-h-dvh w-full max-w-[430px] content-center gap-3 px-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold leading-tight">Eko</h1>
          <p className="text-sm leading-5 text-muted-foreground">Web receiver</p>
          <div className="mt-1">
            <NetworkBadge label="Same network" />
          </div>
        </div>

        <Card className="gap-4 rounded-2xl py-5 shadow-none">
          <CardHeader className="px-5">
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-5">
            <div className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">{message}</div>
            <label className="grid gap-2 text-sm font-medium" htmlFor="web-receiver-name">
              Receiver name
              <Input
                id="web-receiver-name"
                value={deviceName}
                onBlur={() => finalReceiverName("web")}
                onChange={(event) => setReceiverName("web", event.target.value)}
                maxLength={40}
                disabled={status === "connected" || status === "waiting"}
              />
            </label>
            <audio ref={audioRef} className="hidden" playsInline preload="auto">
              <track kind="captions" label="No captions available" />
            </audio>

            <div
              className={cn(
                "relative h-32 w-full overflow-hidden rounded-xl bg-black/40 transition-opacity",
                status === "connected" ? "opacity-100" : "opacity-30",
              )}
            >
              <AudioWaveVisualizer
                stream={stream}
                isPlaying={isPlaying}
                className="absolute inset-0"
              />
              {status !== "connected" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-white/40">Waiting for audio…</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={status !== "connected"}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all",
                  status === "connected" ? "hover:bg-primary/80 active:scale-95" : "opacity-50",
                )}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>

              <span className="min-w-[3rem] text-sm font-medium tabular-nums text-muted-foreground">
                {formatTime(elapsed)}
              </span>

              {/* Visual progress bar */}
              <div className="flex-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
                    style={{
                      width: status === "connected" ? "100%" : "0%",
                      transitionDuration: status === "connected" ? "60s" : "0s",
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={volume > 0 ? "Mute" : "Unmute"}
                >
                  {volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <div className="w-20">
                  <Slider
                    value={[volume * 100]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(vals) => setVolume(vals[0] / 100)}
                    disabled={status !== "connected"}
                  />
                </div>
              </div>
            </div>

            <ConnectionQualityPanel
              onQuality={writeQuality}
              peer={status === "connected" ? peer : null}
            />

            {status === "connected" ? (
              <Button className="h-11" onClick={disconnect} variant="outline">
                Disconnect
              </Button>
            ) : (
              <Button className="h-11" disabled={!payload} onClick={() => void connect()}>
                Ask Desktop
              </Button>
            )}
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
