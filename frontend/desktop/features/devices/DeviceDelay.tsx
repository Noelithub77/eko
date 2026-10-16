import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import type { Device, StreamProfilerSample } from "@shared/bindings/tauri";
import { summarizeDevice } from "@shared/utils/latency-summary";

type Props = { device: Device; roomId: string; samples: StreamProfilerSample[] };
export function DeviceDelay({ device, roomId, samples }: Props) {
  const [warmingUp, setWarmingUp] = useState(true);
  useEffect(() => {
    const connectedAt = /^\d+$/.test(device.connectedAt ?? "") ? Number(device.connectedAt) : Date.parse(device.connectedAt ?? "");
    const remaining = Number.isFinite(connectedAt) ? Math.max(0, Math.min(10_000, connectedAt + 10_000 - Date.now())) : 10_000;
    setWarmingUp(remaining > 0);
    const timer = window.setTimeout(() => setWarmingUp(false), remaining);
    return () => window.clearTimeout(timer);
  }, [device.deviceId, device.connectedAt, device.state, roomId]);
  if (device.state !== "connected") return null;
  const summary = summarizeDevice(samples, device.deviceId, roomId);
  const delay = summary.delay.averageMs;
  const buffer = summary.buffer.averageMs;
  const relayed = device.connectionPath === "relayed";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Audio delay for ${device.label ?? device.deviceName}`} className="mt-1 text-xs tabular-nums text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
          {delay !== null ? `~${Math.round(delay)} ms avg delay` : buffer !== null ? `${Math.round(buffer)} ms avg buffer` : warmingUp && summary.samples === 0 ? "Measuring delay…" : "Delay unavailable"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="gap-2" side="top">
        <p className="font-semibold">{relayed ? "Relay may add audio delay" : "Audio delay"}</p>
        <p className="text-muted-foreground">
          {delay !== null ? `Estimated delay: ${Math.round(delay)} ms average · ${Math.round(summary.delay.p95Ms ?? delay)} ms p95.` : "Delay estimate unavailable."}
        </p>
        {delay === null && buffer === null ? <p className="text-muted-foreground">{summary.samples === 0 ? "No recent receiver stats. Refresh the listener page and reconnect to use the latest client." : "This browser has not reported enough timing data to estimate delay."}</p> : null}
        <p className="text-muted-foreground">{buffer !== null ? `Receiver buffer: ${Math.round(buffer)} ms average. ` : ""}Rolling 30 seconds.</p>
        {summary.roundTrip.averageMs !== null ? <p className="text-muted-foreground">Network round trip: {Math.round(summary.roundTrip.averageMs)} ms average.</p> : null}
        <p className="text-muted-foreground">Capture, decoding and speaker or Bluetooth delay are not included.</p>
        {relayed ? <p>Use the same Wi-Fi or one mobile hotspot for a shorter path. Improvement varies; compare the average after reconnecting.</p> : null}
      </PopoverContent>
    </Popover>
  );
}
