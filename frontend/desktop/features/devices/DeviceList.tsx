import { Check, Power, ShieldX, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
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
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {devices.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No devices
          </div>
        ) : (
          devices.map((device) => (
            <DeviceRow
              device={device}
              key={device.deviceId}
              onAllow={onAllow}
              onDeny={onDeny}
              onDisconnect={onDisconnect}
              onSharingChange={onSharingChange}
              onUnblock={onUnblock}
            />
          ))
        )}
      </CardContent>
    </Card>
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
    <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">
          {device.state} · {device.joinMethod} · ICE {device.iceState}
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
      </div>
    </div>
  );
}
