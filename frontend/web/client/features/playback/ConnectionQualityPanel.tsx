import { useEffect, useMemo, useState } from "react";
import { createConnectionQualityTracker, type ConnectionQuality } from "./connection-quality";

type ConnectionQualityPanelProps = {
  onQuality?: (quality: ConnectionQuality) => void;
  peer: RTCPeerConnection | null;
};

type QualityLevel = "good" | "okay" | "poor" | "unknown";

const emptyQuality: ConnectionQuality = {
  latencyMs: null,
  jitterMs: null,
  bufferMs: null,
  packetLossPercent: null,
  packetsReceived: null,
  packetsLost: null,
};

export function ConnectionQualityPanel({ onQuality, peer }: ConnectionQualityPanelProps) {
  const [quality, setQuality] = useState<ConnectionQuality>(emptyQuality);
  const tracker = useMemo(() => (peer ? createConnectionQualityTracker(peer) : null), [peer]);

  useEffect(() => {
    if (!tracker) {
      setQuality(emptyQuality);
      return;
    }

    let isActive = true;

    const readQuality = async () => {
      try {
        const nextQuality = await tracker.read();
        if (isActive) {
          setQuality(nextQuality);
          onQuality?.(nextQuality);
        }
      } catch {
        if (isActive) {
          setQuality(emptyQuality);
        }
      }
    };

    void readQuality();
    const interval = window.setInterval(() => void readQuality(), 2000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [onQuality, tracker]);

  if (!peer) {
    return null;
  }

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-3">
      <div>
        <h2 className="text-sm font-semibold">Stream quality</h2>
        <p className="text-xs text-muted-foreground">Updates every 2 seconds.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Latency"
          level={getLatencyLevel(quality.latencyMs)}
          note="Round trip delay."
          suffix="ms"
          value={quality.latencyMs}
        />
        <StatTile
          label="Jitter"
          level={getJitterLevel(quality.jitterMs)}
          note="Packet timing wobble."
          suffix="ms"
          value={quality.jitterMs}
        />
        <StatTile
          label="Buffer"
          level={getBufferLevel(quality.bufferMs)}
          note="Audio held to smooth."
          suffix="ms"
          value={quality.bufferMs}
        />
        <StatTile
          decimals={2}
          label="Packet loss"
          level={getPacketLossLevel(quality.packetLossPercent)}
          note="Missing packets."
          suffix="%"
          value={quality.packetLossPercent}
        />
      </div>
    </section>
  );
}

type StatTileProps = {
  decimals?: number;
  label: string;
  level: QualityLevel;
  note: string;
  suffix: string;
  value: number | null;
};

function StatTile({ decimals = 0, label, level, note, suffix, value }: StatTileProps) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${getLevelClass(level)}`}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-none">
        {formatValue(value, decimals)}
        <span className="ml-1 text-xs font-medium">{suffix}</span>
      </div>
      <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</div>
    </div>
  );
}

function formatValue(value: number | null, decimals: number): string {
  if (value === null) {
    return "--";
  }

  return value.toFixed(decimals);
}

function getLevelClass(level: QualityLevel): string {
  if (level === "good") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (level === "okay") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  if (level === "poor") {
    return "border-red-200 bg-red-50 text-red-950";
  }

  return "border-border bg-muted text-foreground";
}

function getLatencyLevel(value: number | null): QualityLevel {
  if (value === null) {
    return "unknown";
  }
  if (value <= 60) {
    return "good";
  }
  if (value <= 120) {
    return "okay";
  }
  return "poor";
}

function getJitterLevel(value: number | null): QualityLevel {
  if (value === null) {
    return "unknown";
  }
  if (value <= 20) {
    return "good";
  }
  if (value <= 50) {
    return "okay";
  }
  return "poor";
}

function getBufferLevel(value: number | null): QualityLevel {
  if (value === null) {
    return "unknown";
  }
  if (value <= 80) {
    return "good";
  }
  if (value <= 180) {
    return "okay";
  }
  return "poor";
}

function getPacketLossLevel(value: number | null): QualityLevel {
  if (value === null) {
    return "unknown";
  }
  if (value <= 1) {
    return "good";
  }
  if (value <= 3) {
    return "okay";
  }
  return "poor";
}
