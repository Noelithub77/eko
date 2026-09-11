import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { NetworkBadge } from "@shared/components/NetworkBadge";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { cn } from "@shared/lib/utils";
import type { QrPairingPayload } from "@shared/types/stream";
import { createLocalPairingLink, createPairingLink } from "@shared/utils/pairing-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { StyledPairingQr } from "./StyledPairingQr";

type QrPairingCardProps = {
  payload: QrPairingPayload | null;
};

export function QrPairingCard({ payload }: QrPairingCardProps) {
  const [copied, setCopied] = useState(false);
  const [pairingMode, setPairingMode] = useState<"local" | "hosted">("local");
  const localQrValue = payload ? createLocalPairingLink(payload) : "";
  const hostedQrValue = payload ? createPairingLink(payload) : "";
  const qrValue = pairingMode === "local" ? localQrValue : hostedQrValue;

  const handleOpen = () => {
    if (qrValue) {
      void openUrl(qrValue);
    }
  };

  const handleCopy = async () => {
    if (!qrValue) return;
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Card className="min-h-[360px] rounded-2xl shadow-sm xl:min-h-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xl">QR Pairing</CardTitle>
          {payload?.hosted ? (
            <div className="flex rounded-md border bg-muted/50 p-0.5 text-xs">
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  pairingMode === "local" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
                onClick={() => setPairingMode("local")}
              >
                Local
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  pairingMode === "hosted" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
                onClick={() => setPairingMode("hosted")}
              >
                Hosted
              </button>
            </div>
          ) : null}
          <NetworkBadge
            label={pairingMode === "local" ? "Local first" : "Hosted signaling"}
            tooltip={
              pairingMode === "local"
                ? "The browser opens the desktop locally first. Audio stays direct WebRTC; hosted signaling is a fallback."
                : "Pairing uses Eko’s hosted service. Audio still travels directly between your devices and is never relayed."
            }
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 px-4 pb-4">
        <div className="group relative h-full w-full">
          {payload ? (
            <StyledPairingQr value={qrValue} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-base text-muted-foreground">
              Preparing secure pairing
            </span>
          )}
          {payload ? (
            <div className="absolute top-2 right-2 z-10 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={handleOpen}
                aria-label="Open pairing link in browser"
                title="Open in browser"
              >
                <ExternalLink className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={handleCopy}
                aria-label="Copy pairing link"
                title={copied ? "Copied!" : "Copy link"}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
