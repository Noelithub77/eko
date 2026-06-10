import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Power,
  ShieldX,
  Smartphone,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@shared/components/ui/collapsible";
import type { Device } from "@shared/types/device";

type DeviceListProps = {
  devices: Device[];
  onAllow: (deviceId: string) => void;
  onDeny: (deviceId: string) => void;
  onUnblock: (deviceId: string) => void;
  onDisconnect: (deviceId: string) => void;
  onSharingChange: (deviceId: string, enabled: boolean) => void;
};

export function DeviceList({
  devices,
  onAllow,
  onDeny,
  onUnblock,
  onDisconnect,
  onSharingChange,
}: DeviceListProps) {
  const [previousOpen, setPreviousOpen] = useState(false);
  const connectedDevices = devices.filter((device) => device.state === "connected");
  const approvalDevices = devices.filter(
    (device) => device.state === "pending" || device.state === "connecting",
  );
  const previousDevices = devices.filter((device) =>
    ["denied", "disconnected", "failed"].includes(device.state),
  );

  return (
    <Card className="flex h-full flex-col rounded-2xl shadow-sm">
      <CardHeader className="shrink-0">
        <CardTitle className="text-xl">Devices</CardTitle>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto">
        {devices.length === 0 ? (
          <EmptyDevices />
        ) : (
          <>
            <DeviceSection
              devices={connectedDevices}
              emptyText="No phone is connected right now."
              title="Connected now"
            >
              {connectedDevices.map((device) => (
                <DeviceRow
                  device={device}
                  key={device.deviceId}
                  onAllow={onAllow}
                  onDeny={onDeny}
                  onDisconnect={onDisconnect}
                  onSharingChange={onSharingChange}
                  onUnblock={onUnblock}
                />
              ))}
            </DeviceSection>

            {approvalDevices.length > 0 ? (
              <DeviceSection devices={approvalDevices} title="Waiting for approval">
                {approvalDevices.map((device) => (
                  <DeviceRow
                    device={device}
                    key={device.deviceId}
                    onAllow={onAllow}
                    onDeny={onDeny}
                    onDisconnect={onDisconnect}
                    onSharingChange={onSharingChange}
                    onUnblock={onUnblock}
                  />
                ))}
              </DeviceSection>
            ) : null}

            {previousDevices.length > 0 ? (
              <Collapsible onOpenChange={setPreviousOpen} open={previousOpen}>
                <CollapsibleTrigger asChild>
                  <Button className="w-full justify-between px-0" variant="ghost">
                    <span>Previous devices ({previousDevices.length})</span>
                    <ChevronDown
                      className={
                        previousOpen ? "rotate-180 transition-transform" : "transition-transform"
                      }
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 grid gap-3">
                  {previousDevices.map((device) => (
                    <DeviceRow
                      device={device}
                      key={device.deviceId}
                      onAllow={onAllow}
                      onDeny={onDeny}
                      onDisconnect={onDisconnect}
                      onSharingChange={onSharingChange}
                      onUnblock={onUnblock}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

type DeviceSectionProps = {
  children: React.ReactNode;
  devices: Device[];
  emptyText?: string;
  title: string;
};

function DeviceSection({ children, devices, emptyText, title }: DeviceSectionProps) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{devices.length}</span>
      </div>
      {devices.length > 0 ? children : <EmptySection text={emptyText ?? "No devices here."} />}
    </section>
  );
}

function DeviceRow({
  device,
  onAllow,
  onDeny,
  onUnblock,
  onDisconnect,
  onSharingChange,
}: Omit<DeviceListProps, "devices"> & { device: Device }) {
  const title = device.label ?? device.deviceName;

  return (
    <div className="grid gap-4 rounded-2xl border bg-background p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Smartphone className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{deviceStatusText(device)}</span>
            <span className="text-muted-foreground/60">•</span>
            <span>{joinMethodText(device)}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {device.state === "pending" ? (
          <>
            <Button onClick={() => onAllow(device.deviceId)} size="sm">
              <Check />
              Allow
            </Button>
            <Button onClick={() => onDeny(device.deviceId)} size="sm" variant="destructive">
              <X />
              Deny
            </Button>
          </>
        ) : null}
        {device.state === "denied" ? (
          <Button onClick={() => onUnblock(device.deviceId)} size="sm" variant="outline">
            <ShieldX />
            Unblock
          </Button>
        ) : null}
        {device.state === "connected" ? (
          <>
            <Button
              onClick={() => onSharingChange(device.deviceId, device.sharing !== "enabled")}
              size="sm"
              variant="outline"
            >
              {device.sharing === "enabled" ? <VolumeX /> : <Volume2 />}
              {device.sharing === "enabled" ? "Mute" : "Share"}
            </Button>
            <Button onClick={() => onDisconnect(device.deviceId)} size="sm" variant="outline">
              <Power />
              Disconnect
            </Button>
          </>
        ) : null}
        {device.state === "connecting" ? (
          <Button disabled size="sm" variant="outline">
            <Clock />
            Connecting
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyDevices() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed p-8 text-center">
      <div>
        <Smartphone className="mx-auto mb-3 size-8 text-muted-foreground" />
        <p className="text-base font-medium">No phones yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan the QR code from your phone to connect.
        </p>
      </div>
    </div>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">{text}</div>
  );
}

function deviceStatusText(device: Device): string {
  if (device.state === "connected") {
    return device.sharing === "enabled" ? "Connected and sharing audio" : "Connected but muted";
  }

  if (device.state === "pending") {
    return "Waiting for your approval";
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

function joinMethodText(device: Device): string {
  return device.joinMethod === "qr" ? "QR code" : "Nearby device";
}
