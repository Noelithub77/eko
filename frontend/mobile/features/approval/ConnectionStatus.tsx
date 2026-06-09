import { PlugZap } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";

type ConnectionStatusProps = {
  status: "disconnected" | "waiting" | "connecting" | "connected" | "denied";
  connectedHost?: {
    name: string;
    address: string;
  };
  latencyMs?: number | null;
  onDisconnect?: () => void;
};

export function ConnectionStatus({
  connectedHost,
  latencyMs,
  onDisconnect,
  status,
}: ConnectionStatusProps) {
  if (status === "connected" && connectedHost) {
    return (
      <Card className="gap-4 rounded-2xl py-5 shadow-none">
        <CardHeader className="px-5">
          <CardTitle>Connected</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 px-5">
          <div className="rounded-2xl bg-muted p-4">
            <div className="text-sm text-muted-foreground">Device</div>
            <div className="mt-1 text-lg font-semibold">{connectedHost.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{connectedHost.address}</div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
            <span className="text-sm text-muted-foreground">Latency</span>
            <span className="text-xl font-semibold">
              {latencyMs === null ? "--" : latencyMs} ms
            </span>
          </div>
          <Button className="h-11" onClick={onDisconnect} variant="outline">
            <PlugZap />
            Disconnect
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-4 rounded-2xl py-5 shadow-none">
      <CardHeader className="px-5">
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">{status}</div>
      </CardContent>
    </Card>
  );
}
