import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NetworkBadge } from "@shared/components/NetworkBadge";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { cn } from "@shared/lib/utils";
import type { QrPairingPayload } from "@shared/types/stream";
import { parseQrPayload } from "@shared/utils/signaling-client";

const INVERTED_SCAN_MS = 250;
const INVERTED_SCAN_SIZE = 640;

type ScanQrScreenProps = {
  compact?: boolean;
  onScanned: (payload: QrPairingPayload) => void;
};

export function ScanQrScreen({ compact = false, onScanned }: ScanQrScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [message, setMessage] = useState("Camera starts when needed.");
  const isCompact = compact || hasScanned;

  useEffect(() => {
    if (!isScanning || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    const reader = new BrowserQRCodeReader();
    let isActive = true;

    const handleText = (text: string) => {
      if (!isActive) {
        return;
      }

      const payload = parseQrPayload(text);
      if (payload) {
        isActive = false;
        onScanned(payload);
        setHasScanned(true);
        setIsScanning(false);
        setMessage("QR scanned.");
      } else {
        setMessage("Invalid eko QR.");
      }
    };

    const controlsPromise = reader
      .decodeFromVideoDevice(undefined, video, (result) => {
        if (result) {
          handleText(result.getText());
        }
      })
      .catch(() => setMessage("Camera unavailable."));

    // The desktop QR is light on dark, which zxing cannot read, so also try inverted frames.
    const canvas = document.createElement("canvas");
    const invertedTimer = window.setInterval(() => {
      const text = decodeInvertedFrame(reader, video, canvas);
      if (text) {
        handleText(text);
      }
    }, INVERTED_SCAN_MS);

    return () => {
      isActive = false;
      window.clearInterval(invertedTimer);
      controlsPromise.then((controls) => controls?.stop()).catch(() => undefined);
    };
  }, [isScanning, onScanned]);

  if (isCompact) {
    return (
      <button
        className="flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm font-medium shadow-none"
        onClick={() => {
          setHasScanned(false);
          setIsScanning(true);
          setMessage("Place the QR inside the box.");
        }}
        type="button"
      >
        <ScanLine className="size-4" />
        Scan another
      </button>
    );
  }

  return (
    <Card className="gap-4 rounded-2xl py-5 shadow-none">
      <CardHeader className="px-5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Scan QR</CardTitle>
          <NetworkBadge label="Same network" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
          <video className="h-full w-full object-cover" muted ref={videoRef} />
          <QrFrame isActive={isScanning} />
        </div>
        <Button className="h-11" onClick={() => setIsScanning((current) => !current)}>
          <Camera />
          {isScanning ? "Stop" : "Scan"}
        </Button>
        <div className="text-center text-sm text-muted-foreground">{message}</div>
      </CardContent>
    </Card>
  );
}

function QrFrame({ isActive }: { isActive: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-background/10">
      <div
        className={cn(
          "relative size-[72%] rounded-2xl border border-dashed border-foreground/30",
          isActive && "border-primary",
        )}
      >
        <span className="absolute -left-0.5 -top-0.5 size-10 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
        <span className="absolute -right-0.5 -top-0.5 size-10 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
        <span className="absolute -bottom-0.5 -left-0.5 size-10 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
        <span className="absolute -bottom-0.5 -right-0.5 size-10 rounded-br-2xl border-b-4 border-r-4 border-primary" />
      </div>
    </div>
  );
}

function decodeInvertedFrame(
  reader: BrowserQRCodeReader,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): string | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
    return null;
  }

  const scale = Math.min(1, INVERTED_SCAN_SIZE / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.filter = "invert(1)";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return reader.decodeFromCanvas(canvas).getText();
  } catch {
    // No code in this frame.
    return null;
  }
}
