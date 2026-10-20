import { useCallback, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import type { QrPairingPayload } from "@shared/types/stream";
import { createPairingLink } from "@shared/utils/pairing-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { StyledPairingQr } from "./StyledPairingQr";
import { Spinner } from "@shared/components/ui/spinner";
import { cn } from "@shared/lib/utils";

type QrPairingCardProps = {
  payload: QrPairingPayload | null;
  error?: string | null;
};

export function QrPairingCard({ payload, error }: QrPairingCardProps) {
  const [copied, setCopied] = useState(false);
  const [renderedValue, setRenderedValue] = useState("");
  const [renderFailure, setRenderFailure] = useState<{ value: string; message: string } | null>(null);
  const qrValue = payload?.hosted ? createPairingLink(payload) : "";
  const renderError = renderFailure?.value === qrValue ? renderFailure.message : null;
  const onRenderError = useCallback((message: string) => setRenderFailure({ value: qrValue, message }), [qrValue]);
  const failure = error || renderError || (payload && !qrValue ? "Hosted pairing is unavailable. Restart the stream to try again." : null);
  const isLoading = !failure && (!qrValue || renderedValue !== qrValue);

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
      <div className="relative mt-8 flex aspect-square w-full max-w-[min(38vh,360px)] items-center justify-center" aria-busy={isLoading}>
        <div className={cn("w-full opacity-80", (isLoading || failure) && "pointer-events-none select-none blur-sm opacity-35")}
          aria-hidden={isLoading || Boolean(failure)}>
          <StyledPairingQr key={qrValue || "placeholder"} value={qrValue || "eko-pairing-loading"}
            onReady={setRenderedValue} onError={onRenderError} />
        </div>
        {isLoading && <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Preparing secure pairing">
          <span className="flex size-14 items-center justify-center rounded-full border bg-background/90 shadow-sm">
            <Spinner className="size-7 text-primary" />
          </span>
        </div>}
        {failure && <p className="absolute inset-x-0 rounded-xl bg-background/90 p-4 text-sm text-destructive" role="alert">{failure}</p>}
      </div>
      {qrValue && !isLoading && !failure ? (
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
