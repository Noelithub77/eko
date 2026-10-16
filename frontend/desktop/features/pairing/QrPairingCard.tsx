import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import type { QrPairingPayload } from "@shared/types/stream";
import { createPairingLink } from "@shared/utils/pairing-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { StyledPairingQr } from "./StyledPairingQr";

type QrPairingCardProps = {
  payload: QrPairingPayload | null;
};

export function QrPairingCard({ payload }: QrPairingCardProps) {
  const [copied, setCopied] = useState(false);
  const qrValue = payload?.hosted ? createPairingLink(payload) : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="flex flex-col items-center text-center">
      <h2 className="text-[clamp(1.5rem,2.1vw,2.25rem)] font-bold tracking-tight">Scan to listen</h2>
      <div className="mt-8 flex aspect-square w-full max-w-[min(38vh,360px)] items-center justify-center opacity-80">
        {qrValue ? (
          <StyledPairingQr value={qrValue} />
        ) : (
          <span className={payload ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {payload
              ? "Hosted pairing is unavailable. Restart the stream to try again."
              : "Preparing secure pairing"}
          </span>
        )}
      </div>
      {qrValue ? (
        <div className="mt-8 flex gap-1 text-muted-foreground">
          <Button onClick={() => void handleCopy()} size="sm" variant="ghost">
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button onClick={() => void openUrl(qrValue)} size="sm" variant="ghost">
            <ExternalLink />
            Open
          </Button>
        </div>
      ) : null}
    </section>
  );
}
