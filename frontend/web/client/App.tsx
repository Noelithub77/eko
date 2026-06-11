import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { parsePairingSource } from "@shared/utils/pairing-link";
import { startWebReceiver, type WebReceiverSession } from "@shared/utils/web-signaling-client";
import type { JoinRequest } from "@shared/types/device";
import type { PairingLinkPayload } from "@shared/types/pairing-link";
import { ConnectionQualityPanel } from "./features/playback/ConnectionQualityPanel";
import type { ConnectionQuality } from "./features/playback/connection-quality";
import { createLiveProfiler, type LiveProfiler } from "./features/playback/live-profiler";

type ConnectionState = "ready" | "waiting" | "connected" | "failed";

function App() {
  const payload = useMemo(() => parsePairingSource(window.location.href), []);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [status, setStatus] = useState<ConnectionState>(payload ? "ready" : "failed");
  const [message, setMessage] = useState(
    payload ? "Ready to ask the desktop." : "This link is missing pairing data.",
  );
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null);
  const [profiler, setProfiler] = useState<LiveProfiler | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<WebReceiverSession | null>(null);

  const connect = useCallback(async () => {
    if (!payload) {
      return;
    }

    setStatus("waiting");
    setMessage("Asking desktop.");
    sessionRef.current?.close();
    setPeer(null);
    setProfiler(null);

    const request = createJoinRequest(payload, deviceId);
    try {
      const session = await startWebReceiver(payload, request, {
        onStatus: (nextMessage) => setMessage(nextMessage),
        onStream: (stream) => {
          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.muted = false;
            void audioRef.current.play();
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
  }, [deviceId, payload]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setPeer(null);
    setProfiler(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    setStatus(payload ? "ready" : "failed");
    setMessage(payload ? "Ready to ask the desktop." : "This link is missing pairing data.");
  }, [payload]);

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
          <p className="text-sm leading-5 text-muted-foreground">Web receiver for iPhone.</p>
        </div>
        <Card className="gap-4 rounded-2xl py-5 shadow-none">
          <CardHeader className="px-5">
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-5">
            <div className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">{message}</div>
            <audio autoPlay controls playsInline preload="auto" ref={audioRef}>
              <track kind="captions" label="No captions available" />
            </audio>
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

function createJoinRequest(payload: PairingLinkPayload, deviceId: string): JoinRequest {
  return {
    deviceId,
    deviceName: "Web receiver",
    method: "qr",
    roomId: payload.roomId,
    token: payload.token,
  };
}

function getDeviceId(): string {
  const key = "eko-web-device-id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const created = createDeviceId();
  localStorage.setItem(key, created);
  return created;
}

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
