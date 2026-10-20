import { cn } from "@shared/lib/utils";

type ConnectionState = "disconnected" | "waiting" | "connecting" | "connected" | "denied";

type ConnectionStatusProps = {
  status: ConnectionState;
};

const statusLabels: Record<ConnectionState, string> = {
  disconnected: "Not connected",
  waiting: "Waiting for desktop approval",
  connecting: "Connecting",
  connected: "Connected",
  denied: "Denied by desktop",
};

export function ConnectionStatus({ status }: ConnectionStatusProps) {
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
