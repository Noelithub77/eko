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
    <Card className="h-full min-h-0 rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">QR Pairing</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 px-4 pb-4">
        <div className="relative h-full w-full">
          {payload ? (
            <StyledPairingQr value={qrValue} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-base text-muted-foreground">
              Preparing QR code
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
