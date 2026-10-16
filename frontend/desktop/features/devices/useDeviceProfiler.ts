import { useEffect, useState } from "react";
import { commands, type StreamProfilerSample } from "@shared/bindings/tauri";

export function useDeviceProfiler(roomId: string | null): StreamProfilerSample[] {
  const [samples, setSamples] = useState<StreamProfilerSample[]>([]);
  useEffect(() => {
    setSamples([]);
    if (!roomId || !("__TAURI_INTERNALS__" in window)) return;
    let active = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await commands.getStreamProfiler();
        if (active) setSamples(next);
      } catch {
        if (active) setSamples([]);
      } finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [roomId]);
  return samples;
}
