import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { NetworkBadge } from "@shared/components/NetworkBadge";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { QrPairingPayload } from "@shared/types/stream";
import { createPairingLink } from "@shared/utils/pairing-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { StyledPairingQr } from "./StyledPairingQr";

type QrPairingCardProps = {
  payload: QrPairingPayload | null;
};

export function QrPairingCard({ payload }: QrPairingCardProps) {
  const [copied, setCopied] = useState(false);
  const qrValue = payload ? createPairingLink(payload) : "";

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
    <Card className="h-full min-h-0 rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xl">QR Pairing</CardTitle>
          <NetworkBadge
            label={payload?.hosted ? "Direct audio" : "Same network"}
            tooltip={
              payload?.hosted
                ? "Pairing uses Eko’s hosted service. Audio still travels directly between your devices and is never relayed."
                : undefined
            }
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 px-4 pb-4">
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
