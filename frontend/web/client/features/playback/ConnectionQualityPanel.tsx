import { useEffect, useMemo, useState } from "react";
import { createConnectionQualityTracker } from "./connection-quality";
import { emptyQuality, type ConnectionQuality } from "@shared/types/connection-quality";
import { StreamQualityPanel } from "@shared/components/receiver/StreamQualityPanel";

type ConnectionQualityPanelProps = {
  onQuality?: (quality: ConnectionQuality) => void;
  peer: RTCPeerConnection | null;
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

  return peer ? <StreamQualityPanel quality={quality} /> : null;
}
