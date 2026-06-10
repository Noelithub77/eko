import { RefreshCw, Wifi } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { RoomSession } from "@shared/types/stream";

type StreamControlsProps = {
  session: RoomSession | null;
  onRestart: () => void;
};

export function StreamControls({ session, onRestart }: StreamControlsProps) {
  const isRunning = session?.status === "running";

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Stream</CardTitle>
        <CardAction>
          <Button className="h-11 px-5" onClick={onRestart} variant="outline">
            <RefreshCw />
            Restart
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 rounded-2xl border bg-background p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Wifi className="size-5" />
          </div>
          <div>
            <div className="text-base font-semibold">
              {isRunning ? "Ready for phones" : "Starting stream"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Scan the QR code below or find this computer nearby.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
