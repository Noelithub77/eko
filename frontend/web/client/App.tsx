import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { parsePairingSource } from "@shared/utils/pairing-link";
import { startWebReceiver, type WebReceiverSession } from "@shared/utils/web-signaling-client";
import type { JoinRequest } from "@shared/types/device";
import type { PairingLinkPayload } from "@shared/types/pairing-link";

type ConnectionState = "ready" | "waiting" | "connected" | "failed";

function App() {
  const payload = useMemo(() => parsePairingSource(window.location.href), []);
  const [status, setStatus] = useState<ConnectionState>(payload ? "ready" : "failed");
  const [message, setMessage] = useState(
    payload ? "Ready to ask the desktop." : "This link is missing pairing data.",
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<WebReceiverSession | null>(null);

  const connect = useCallback(async () => {
    if (!payload) {
      return;
    }

    setStatus("waiting");
    setMessage("Asking desktop.");
    sessionRef.current?.close();

    const request = createJoinRequest(payload);
    sessionRef.current = await startWebReceiver(payload, request, {
      onStatus: (nextMessage) => setMessage(nextMessage),
      onStream: (stream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          void audioRef.current.play();
        }
        setStatus("connected");
        setMessage("Connected.");
      },
    });
  }, [payload]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    setStatus(payload ? "ready" : "failed");
    setMessage(payload ? "Ready to ask the desktop." : "This link is missing pairing data.");
  }, [payload]);

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
            <audio controls ref={audioRef}>
              <track kind="captions" label="No captions available" />
            </audio>
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

function createJoinRequest(payload: PairingLinkPayload): JoinRequest {
  return {
    deviceId: getDeviceId(),
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
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}
