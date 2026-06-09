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
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Stream</CardTitle>
        <CardAction>
          <Button
            className="h-11 px-5"
            onClick={isRunning ? onStop : onStart}
            variant={isRunning ? "outline" : "default"}
          >
            {isRunning ? <Pause /> : <Play />}
            {isRunning ? "Stop" : "Start"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between rounded-2xl border bg-background p-4">
          <div className="flex items-center gap-2">
            <Radar className="size-5 text-muted-foreground" />
            <span className="text-base font-medium">LAN discovery</span>
          </div>
          <Switch checked={lanEnabled} disabled={!isRunning} onCheckedChange={onLanChange} />
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
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
    <div className="rounded-2xl bg-muted px-4 py-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}
