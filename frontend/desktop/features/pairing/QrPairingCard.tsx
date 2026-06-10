import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { QrPairingPayload } from "@shared/types/stream";
import { createPairingLink } from "@shared/utils/pairing-link";

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
      <CardContent className="h-full">
        <div className="flex min-h-[420px] h-full items-center justify-center rounded-2xl border bg-background p-8">
          {payload ? (
            <QRCodeSVG
              className="h-[min(48vh,360px)] w-[min(48vh,360px)]"
              value={qrValue}
              level="M"
              includeMargin
            />
          ) : (
            <span className="text-base text-muted-foreground">Preparing QR code</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
