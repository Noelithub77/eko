import { Pause, Play, Radar } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { Switch } from "@shared/components/ui/switch";
import type { RoomSession } from "@shared/types/stream";

type StreamControlsProps = {
  session: RoomSession | null;
  onStart: () => void;
  onStop: () => void;
  onLanChange: (enabled: boolean) => void;
};

export function StreamControls({ session, onStart, onStop, onLanChange }: StreamControlsProps) {
  const isRunning = session?.status === "running";
  const lanEnabled = session?.lanDiscoveryEnabled ?? false;

  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle>Stream</CardTitle>
        <CardAction>
          <Button
            onClick={isRunning ? onStop : onStart}
            variant={isRunning ? "outline" : "default"}
          >
            {isRunning ? <Pause /> : <Play />}
            {isRunning ? "Stop" : "Start"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between rounded-md border bg-background p-3">
          <div className="flex items-center gap-2">
            <Radar className="size-4 text-muted-foreground" />
            <span className="font-medium">LAN discovery</span>
          </div>
          <Switch checked={lanEnabled} disabled={!isRunning} onCheckedChange={onLanChange} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <StatusItem label="Status" value={session?.status ?? "idle"} />
          <StatusItem label="Host" value={session?.host ?? "-"} />
          <StatusItem label="Port" value={session?.port?.toString() ?? "-"} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
