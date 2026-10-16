import { createRoot } from "react-dom/client";
import { DeviceDelay } from "../../frontend/desktop/features/devices/DeviceDelay";
import type { Device, StreamProfilerSample } from "../../frontend/shared/bindings/tauri";

export function mount() {
  const container = document.createElement("div");
  container.style.cssText = "padding:32px;max-width:480px";
  document.body.replaceChildren(container);
  const device: Device = { deviceId: "fixture", deviceName: "Test phone", label: null, state: "connected", joinMethod: "qr", connectedAt: "now", webRtcState: "connected", iceState: "connected", connectionPath: "relayed" };
  const sample: StreamProfilerSample = { version: 2, source: "web", kind: "qualitySample", createdAtMs: Date.now(), connectionId: "fixture", deviceId: "fixture", roomId: "fixture-room", sampleIndex: 1, latencyMs: 95, roundTripMs: 70, bufferMs: 60, jitterMs: 5, packetLossPercent: 0, packetsReceived: 100, packetsLost: 0 };
  createRoot(container).render(<div><p>Test phone · Relayed</p><DeviceDelay device={device} roomId="fixture-room" samples={[sample]} /></div>);
}
