import { CheckCircle2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@shared/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { CoreProofStatus, ProofAreaStatus } from "@shared/types/core-proof";
import type { RoomSession } from "@shared/types/stream";
import { getCoreProofStatus } from "@shared/utils/api";

type DevPanelProps = {
  session: RoomSession | null;
  onAddTestDevice: () => void;
};

export function DevPanel({ session, onAddTestDevice }: DevPanelProps) {
  const [coreProofStatus, setCoreProofStatus] = useState<CoreProofStatus | null>(null);
  const chartData =
    session?.metrics.map((metric, index) => ({
      index,
      value: metric.value,
      label: metric.label,
    })) ?? [];
  const events = session?.events ?? [];

  useEffect(() => {
    getCoreProofStatus()
      .then(setCoreProofStatus)
      .catch(() => setCoreProofStatus(null));
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card className="rounded-lg shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle>Stream Server</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <ServerItem label="Status" value={session?.status ?? "idle"} />
          <ServerItem label="Host" value={session?.host ?? "-"} />
          <ServerItem label="Port" value={session?.port?.toString() ?? "-"} />
          <ServerItem label="LAN discovery" value={session?.lanDiscoveryEnabled ? "on" : "off"} />
        </CardContent>
      </Card>
      <Card className="rounded-lg shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle>Core Proof</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {coreProofStatus ? (
            <>
              <ProofItem label="Audio" status={coreProofStatus.audio} />
              <ProofItem label="Discovery" status={coreProofStatus.discovery} />
              <ProofItem label="Signaling" status={coreProofStatus.signaling} />
              <ProofItem label="WebRTC" status={coreProofStatus.webRtc} />
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Core status unavailable</span>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>Latency</CardTitle>
          <CardAction>
            <Button onClick={onAddTestDevice} size="sm" variant="outline">
              <Plus />
              Test phone
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" />
              <YAxis />
              <Tooltip />
              <Line dataKey="value" stroke="var(--foreground)" strokeWidth={2} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent className="grid max-h-64 gap-2 overflow-auto">
          {events.length === 0 ? (
            <span className="text-sm text-muted-foreground">No events</span>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-md border p-2">
                <div className="text-xs uppercase text-muted-foreground">{event.level}</div>
                <div>{event.message}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServerItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function ProofItem({ label, status }: { label: string; status: ProofAreaStatus }) {
  const ready = getProofReady(status);
  const value = getProofValue(status);

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2
          className={ready ? "size-4 text-emerald-600" : "size-4 text-muted-foreground"}
        />
        {label}
      </div>
      <div className="mt-2 text-sm">{value}</div>
      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{status.note}</div>
    </div>
  );
}

function getProofReady(status: ProofAreaStatus): boolean {
  if ("libraryReady" in status) {
    return status.libraryReady;
  }
  return status.captureReady;
}

function getProofValue(status: ProofAreaStatus): string {
  if ("backend" in status) {
    return status.backend;
  }
  if ("serviceType" in status) {
    return status.serviceType;
  }
  if ("transport" in status) {
    return status.transport;
  }
  if ("mediaTransport" in status) {
    return status.mediaTransport;
  }
  return "Ready";
}
