import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { QrPairingPayload } from "@shared/types/stream";
import { createPairingLink } from "@shared/utils/pairing-link";
import { StyledPairingQr } from "./StyledPairingQr";

type QrPairingCardProps = {
  payload: QrPairingPayload | null;
};

export function QrPairingCard({ payload }: QrPairingCardProps) {
  const qrValue = payload ? createPairingLink(payload) : "";

  return (
    <Card className="min-h-full rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">QR Pairing</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full min-h-0 items-center justify-center px-4 pb-4">
        <div className="flex h-full min-h-0 w-full items-center justify-center">
          {payload ? (
            <StyledPairingQr value={qrValue} />
          ) : (
            <span className="text-base text-muted-foreground">Preparing QR code</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
