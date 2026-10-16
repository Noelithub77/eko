import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Clock,
  Power,
  ShieldX,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@shared/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@shared/components/ui/collapsible";
import { cn } from "@shared/lib/utils";
import { DeviceDelay } from "./DeviceDelay";
import { useDeviceProfiler } from "./useDeviceProfiler";
import type { StreamProfilerSample } from "@shared/bindings/tauri";
import type { Device } from "@shared/types/device";

type DeviceListProps = {
  devices: Device[];
  roomId?: string | null;
  onAllow: (deviceId: string) => void;
  onDeny: (deviceId: string) => void;
  onUnblock: (deviceId: string) => void;
  onDisconnect: (deviceId: string) => void;
};

export function DeviceList({
  devices,
  roomId = null,
  onAllow,
  onDeny,
  onUnblock,
  onDisconnect,
}: DeviceListProps) {
  const samples = useDeviceProfiler(roomId);
  const warned = useRef(new Set<string>());
  useEffect(() => { warned.current.clear(); }, [roomId]);
  useEffect(() => {
    for (const device of devices) {
      const key = `${device.deviceId}:${device.connectedAt}`;
      if (device.state !== "connected" || device.connectionPath !== "relayed" || warned.current.has(key)) continue;
      warned.current.add(key);
      toast.warning("Relay may add audio delay", {
        description: "Use the same Wi-Fi or a mobile hotspot for a shorter path. Check this listener’s average delay after reconnecting.",
        duration: 8000,
      });
    }
  }, [devices]);
  const [previousOpen, setPreviousOpen] = useState(false);
  // Requests first: they are the only rows that need the user.
  const activeDevices = [
    ...devices.filter((device) => device.state === "pending" || device.state === "connecting"),
    ...devices.filter((device) => device.state === "connected"),
  ];
  const previousDevices = devices.filter((device) =>
    ["denied", "disconnected", "failed"].includes(device.state),
  );
  const rowActions = { onAllow, onDeny, onDisconnect, onUnblock, samples, roomId };

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm text-muted-foreground">Listeners</h2>
        {activeDevices.length > 0 ? (
          <span className="text-sm text-muted-foreground/60 tabular-nums">{activeDevices.length}</span>
        ) : null}
      </div>
      <div className="-mx-3 mt-3 min-h-0 flex-1 overflow-y-auto">
        {activeDevices.length === 0 ? (
          <p className="px-3 py-3 text-base text-muted-foreground/60">
            No phones yet. Scan the code to connect.
          </p>
        ) : (
          activeDevices.map((device) => (
            <DeviceRow device={device} key={device.deviceId} {...rowActions} />
          ))
        )}

        {previousDevices.length > 0 ? (
          <Collapsible className="mt-2" onOpenChange={setPreviousOpen} open={previousOpen}>
            <CollapsibleTrigger asChild>
              <Button className="mx-3 h-8 px-0 text-muted-foreground hover:bg-transparent" variant="ghost">
                Previous ({previousDevices.length})
                <ChevronDown className={cn("transition-transform", previousOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {previousDevices.map((device) => (
                <DeviceRow device={device} key={device.deviceId} {...rowActions} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </section>
  );
}

function DeviceRow({
  device,
  samples,
  roomId,
  onAllow,
  onDeny,
  onUnblock,
  onDisconnect,
}: Omit<DeviceListProps, "devices"> & { device: Device; samples: StreamProfilerSample[] }) {
  const title = device.label ?? device.deviceName;
  const isPending = device.state === "pending";

  return (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/40",
        isPending && "bg-coral/8 hover:bg-coral/10",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
          device.state === "connected" && "bg-teal/15 text-teal",
          isPending && "bg-coral/15 text-coral",
        )}
      >
        <Smartphone className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold">{title}</div>
        <div className="truncate text-sm text-muted-foreground">
          {[deviceStatusText(device), connectionPathText(device)].filter(Boolean).join(" · ")}
        </div>
        <DeviceDelay device={device} roomId={roomId ?? ""} samples={samples} />
      </div>
      <div className="flex shrink-0 gap-2 empty:hidden">
        {isPending ? (
          <>
            <Button onClick={() => onDeny(device.deviceId)} size="sm" variant="ghost">
              <X />
              Deny
            </Button>
            <Button onClick={() => onAllow(device.deviceId)} size="sm">
              <Check />
              Allow
            </Button>
          </>
        ) : null}
        {device.state === "denied" ? (
          <Button onClick={() => onUnblock(device.deviceId)} size="sm" variant="ghost">
            <ShieldX />
            Unblock
          </Button>
        ) : null}
        {device.state === "connected" ? (
          <Button
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => onDisconnect(device.deviceId)}
            size="sm"
            variant="ghost"
          >
            <Power />
            Disconnect
          </Button>
        ) : null}
        {device.state === "connecting" ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" />
            Connecting
          </span>
        ) : null}
      </div>
    </div>
  );
}

function deviceStatusText(device: Device): string {
  if (device.state === "connected") {
    return "Connected";
  }

  if (device.state === "pending") {
    return "Wants to listen";
  }

  if (device.state === "connecting") {
    return "Connecting";
  }

  if (device.state === "denied") {
    return "Blocked";
  }

  if (device.state === "failed") {
    return "Connection failed";
  }

  return "Disconnected";
}

function connectionPathText(device: Device): string | null {
  if (device.connectionPath === "local") {
    return "Local network";
  }

  if (device.connectionPath === "direct") {
    return "Direct connection";
  }

  if (device.connectionPath === "relayed") {
    return "Relayed";
  }

  if (device.state === "connecting") {
    return "Resolving connection";
  }

  return null;
}
