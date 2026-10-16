import { PlugZap } from "lucide-react";
import { EkoMark } from "@shared/components/EkoMark";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent } from "@shared/components/ui/card";
import { cn } from "@shared/lib/utils";

type ConnectionState = "disconnected" | "waiting" | "connecting" | "connected" | "denied";

type ConnectionStatusProps = {
  status: ConnectionState;
  connectedHost?: {
    name: string;
    address: string;
  };
  onDisconnect?: () => void;
};

const statusLabels: Record<ConnectionState, string> = {
  disconnected: "Not connected",
  waiting: "Waiting for desktop approval",
  connecting: "Connecting",
  connected: "Connected",
  denied: "Denied by desktop",
};

export function ConnectionStatus({ connectedHost, onDisconnect, status }: ConnectionStatusProps) {
  if (status === "connected" && connectedHost) {
    return (
      <Card className="items-center gap-5 rounded-3xl py-8 text-center shadow-none">
        <CardContent className="grid justify-items-center gap-4 px-6">
          <EkoMark animated className="size-20" />
          <div>
            <div className="text-sm font-semibold text-teal">{statusLabels.connected}</div>
            <div className="mt-1 text-xl font-bold">{connectedHost.name}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{connectedHost.address}</div>
          </div>
          <Button className="h-11 w-full" onClick={onDisconnect} variant="outline">
            <PlugZap />
            Disconnect
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isBusy = status === "waiting" || status === "connecting";

  return (
    <div className="flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm">
      <span className="relative flex size-2">
        {isBusy ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-coral opacity-60 motion-reduce:animate-none" />
        ) : null}
        <span
          className={cn(
            "relative size-2 rounded-full bg-muted-foreground",
            isBusy && "bg-coral",
            status === "denied" && "bg-destructive",
          )}
        />
      </span>
      {statusLabels[status]}
    </div>
  );
}
