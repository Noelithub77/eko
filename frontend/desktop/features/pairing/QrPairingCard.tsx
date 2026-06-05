import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { QrPairingPayload } from "@shared/types/stream";

type QrPairingCardProps = {
  payload: QrPairingPayload | null;
};

export function QrPairingCard({ payload }: QrPairingCardProps) {
  const qrValue = payload ? JSON.stringify(payload) : "";

  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle>QR Pairing</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-52 items-center justify-center rounded-lg border bg-background p-4">
          {payload ? (
            <QRCodeSVG value={qrValue} size={180} level="M" includeMargin />
          ) : (
            <span className="text-sm text-muted-foreground">Start stream</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
