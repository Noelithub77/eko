import { CheckCircle2, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { AudioProofStatus } from "@shared/types/core-proof";
import type { DevEvent, RoomSession } from "@shared/types/stream";
import { getAudioCaptureStatus, getCoreProofStatus } from "@shared/utils/api";

type DevPanelProps = {
  session: RoomSession | null;
  logs: DevEvent[];
  showTestControls: boolean;
  onAddTestDevice: () => void;
  onClearLogs: () => Promise<void>;
};

type LogGroup = {
  key: string;
  event: DevEvent;
  count: number;
};

type LogLevelCount = {
  errors: number;
  warnings: number;
};

function groupRepeatedLogs(events: DevEvent[]): LogGroup[] {
  const groups: LogGroup[] = [];

  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last.event.message === event.message && last.event.level === event.level) {
      last.count += 1;
      continue;
    }

    groups.push({ key: event.id, event, count: 1 });
  }

  return groups;
}

function countLogLevels(events: DevEvent[]): LogLevelCount {
  return events.reduce<LogLevelCount>(
    (count, event) => ({
      errors: count.errors + (event.level === "error" ? 1 : 0),
      warnings: count.warnings + (event.level === "warn" ? 1 : 0),
    }),
    { errors: 0, warnings: 0 },
  );
}

function getLogStyle(level: string): string {
  switch (level) {
    case "error":
      return "border-red-500 bg-red-500/10 text-red-700";
    case "warn":
      return "border-yellow-500 bg-yellow-500/10 text-yellow-700";
    default:
      return "border-blue-500 bg-blue-500/10 text-blue-700";
  }
}

function getLogBadgeStyle(level: string): string {
  switch (level) {
    case "error":
      return "bg-red-500 text-white";
    case "warn":
      return "bg-yellow-500 text-black";
    default:
      return "bg-blue-500 text-white";
  }
}

export function DevPanel({
  session,
  logs,
  showTestControls,
  onAddTestDevice,
  onClearLogs,
}: DevPanelProps) {
  const [coreProofStatus, setCoreProofStatus] = useState<CoreProofStatus | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioProofStatus | null>(null);
  const [expandedLogs, setExpandedLogs] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const visibleLogs = expandedLogs ? logs : logs.slice(-12);
  const logGroups = useMemo(() => groupRepeatedLogs(visibleLogs), [visibleLogs]);
  const logLevelCount = useMemo(() => countLogLevels(logs), [logs]);
  const connectedDevices =
    session?.devices.filter((device) => device.state === "connected").length ?? 0;
  const pendingDevices =
    session?.devices.filter((device) => device.state === "pending").length ?? 0;
  const chartData =
    session?.metrics.map((metric, index) => ({
      index,
      value: metric.value,
      label: metric.label,
    })) ?? [];

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  });

  useEffect(() => {
    getCoreProofStatus()
      .then(setCoreProofStatus)
      .catch(() => setCoreProofStatus(null));
    getAudioCaptureStatus()
      .then(setAudioStatus)
      .catch(() => setAudioStatus(null));
  }, []);

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-hidden lg:grid-cols-[1fr_1fr]">
      <Card className="rounded-lg shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle>Monitor</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <MonitorItem label="Status" value={session?.status ?? "idle"} />
          <MonitorItem label="Host" value={session?.host ?? "-"} />
          <MonitorItem label="Port" value={session?.port?.toString() ?? "-"} />
          <MonitorItem label="Connected" value={connectedDevices.toString()} />
          <MonitorItem label="Pending" value={pendingDevices.toString()} />
          <MonitorItem label="Audio" value={audioStatus?.captureReady ? "ready" : "not ready"} />
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle>Health</CardTitle>
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
            <span className="text-sm text-muted-foreground">Health status unavailable</span>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>Stats</CardTitle>
          {showTestControls ? (
            <CardAction>
              <Button onClick={onAddTestDevice} size="sm" variant="outline">
                <Plus />
                Test phone
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <MonitorItem label="Logs" value={logs.length.toString()} />
            <MonitorItem label="Warnings" value={logLevelCount.warnings.toString()} />
            <MonitorItem label="Errors" value={logLevelCount.errors.toString()} />
          </div>
          <div className="h-48">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" />
                <YAxis />
                <Tooltip />
                <Line dataKey="value" stroke="var(--foreground)" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardAction className="flex gap-2">
            <Button onClick={() => setExpandedLogs((value) => !value)} size="sm" variant="outline">
              {expandedLogs ? <ChevronUp /> : <ChevronDown />}
              {expandedLogs ? "Compact" : "Expand"}
            </Button>
            <Button onClick={() => void onClearLogs()} size="sm" variant="outline">
              <Trash2 />
              Clear
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent
          className={
            expandedLogs ? "grid max-h-96 gap-2 overflow-auto" : "grid max-h-64 gap-2 overflow-auto"
          }
          ref={logsRef}
        >
          {logGroups.length === 0 ? (
            <span className="text-sm text-muted-foreground">No logs yet</span>
          ) : (
            logGroups.map((item) => <LogRow item={item} key={item.key} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MonitorItem({ label, value }: { label: string; value: string }) {
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

function LogRow({ item }: { item: LogGroup }) {
  return (
    <div className={`rounded-md border p-2 ${getLogStyle(item.event.level)}`}>
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${getLogBadgeStyle(item.event.level)}`}
        >
          {item.event.level}
        </span>
        {item.count > 1 ? <span className="text-xs font-semibold">x{item.count}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(Number(item.event.createdAt)).toLocaleString()}
        </span>
      </div>
      <div className="mt-1 text-sm">{item.event.message}</div>
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
