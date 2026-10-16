import { useState } from "react";
import { Check, Copy, ExternalLink, Wifi } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
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
      <div className="mt-2">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal hover:bg-teal/20">
              <Wifi className="size-3.5" /> Direct audio + relay fallback
            </button>
          </PopoverTrigger>
          <PopoverContent className="gap-2" side="bottom">
            <p className="font-semibold">A shorter path for audio</p>
            <p className="text-muted-foreground">Pairing is hosted; audio connects directly when possible. A relay may add delay.</p>
            <p>Connect both devices to the same Wi-Fi or one mobile hotspot. Check the average delay under each listener after reconnecting; improvement varies by network.</p>
          </PopoverContent>
        </Popover>
      </div>
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
