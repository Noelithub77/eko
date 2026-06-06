import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { QrPairingPayload } from "@shared/types/stream";
import { parseQrPayload } from "@shared/utils/signaling-client";

type ScanQrScreenProps = {
  onScanned: (payload: QrPairingPayload) => void;
};

export function ScanQrScreen({ onScanned }: ScanQrScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState("Camera starts when needed.");

  useEffect(() => {
    if (!isScanning || !videoRef.current) {
      return;
    }

    const reader = new BrowserQRCodeReader();
    let isActive = true;

    const controlsPromise = reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result || !isActive) {
          return;
        }

        const payload = parseQrPayload(result.getText());
        if (payload) {
          onScanned(payload);
          setIsScanning(false);
          setMessage("QR scanned.");
        } else {
          setMessage("Invalid Eko QR.");
        }
      })
      .catch(() => setMessage("Camera unavailable."));

    return () => {
      isActive = false;
      controlsPromise.then((controls) => controls?.stop()).catch(() => undefined);
    };
  }, [isScanning, onScanned]);

  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle>Scan QR</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <video
          className="aspect-square w-full rounded-lg bg-muted object-cover"
          muted
          ref={videoRef}
        />
        <Button onClick={() => setIsScanning((current) => !current)}>
          <Camera />
          {isScanning ? "Stop" : "Scan"}
        </Button>
        <div className="text-center text-sm text-muted-foreground">{message}</div>
      </CardContent>
    </Card>
  );
}
