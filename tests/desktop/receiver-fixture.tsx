import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import QRCodeStyling from "qr-code-styling";
import App from "../../frontend/mobile/App";
import { QrPairingCard } from "../../frontend/desktop/features/pairing/QrPairingCard";
import type { NativeReceiverEvent, StreamProfilerSample, QrPairingPayload } from "../../frontend/shared/bindings/tauri";
import "../../frontend/mobile/index.css";

const calls: { command: string; payload: unknown }[] = [];
let failControl = false;
const sample: StreamProfilerSample = {
  version: 2, source: "android", kind: "qualitySample", createdAtMs: Date.now(),
  connectionId: "fixture", deviceId: "fixture", roomId: "fixture", sampleIndex: 1,
  latencyMs: 65, roundTripMs: 80, jitterMs: 4, bufferMs: 25,
  packetLossPercent: 0.5, packetsReceived: 100, packetsLost: 1,
};

function send(event: NativeReceiverEvent) { return emit("native-receiver-event", event); }

mockIPC(async (command, payload) => {
  calls.push({ command, payload });
  document.documentElement.dataset.calls = JSON.stringify(calls);
  if (command === "find_nearby_hosts") return [{ host: "127.0.0.1", port: 13370 }];
  if (command === "start_native_receiver") await send({ kind: "waiting", message: "Waiting for desktop approval." });
  if (command === "set_android_playback_paused") {
    if (failControl) { failControl = false; throw new Error("Fixture control failed"); }
    await send({ kind: "playback", isPlaying: !(payload && "paused" in payload && payload.paused === true) });
  }
  if (command === "start_android_media_session") await send({ kind: "playback", isPlaying: true });
  return null;
}, { shouldMockEvents: true });

window.addEventListener("fixture-connect", () => {
  void send({ kind: "connected", message: "Native audio connected." });
  void send({ kind: "quality", sample });
  void send({ kind: "waveform", levels: Array.from({ length: 48 }, (_, i) => (i % 8) / 8) });
});
window.addEventListener("fixture-notification-pause", () => { void send({ kind: "playback", isPlaying: false }); });
window.addEventListener("fixture-notification-play", () => { void send({ kind: "playback", isPlaying: true }); });
window.addEventListener("fixture-missing-quality", () => { void send({ kind: "quality", sample: {
  ...sample, latencyMs: null, roundTripMs: null, jitterMs: null, bufferMs: null, packetLossPercent: null,
} }); });
window.addEventListener("fixture-control-error", () => { failControl = true; });

function QrFixture() {
  const [payload, setPayload] = useState<QrPairingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
  const ready = () => setPayload({ version: 1,
    local: { host: "127.0.0.1", port: 13370 }, hosted: {
      roomId: "fixture", joinToken: "fixture-token", socketUrl: "wss://example.invalid/ws",
      clientUrl: "https://example.invalid/client",
    },
  });
  const fail = () => setError("Fixture startup failed");
  window.addEventListener("fixture-qr-ready", ready);
  window.addEventListener("fixture-qr-error", fail);
  return () => {
    window.removeEventListener("fixture-qr-ready", ready);
    window.removeEventListener("fixture-qr-error", fail);
  };
  }, []);
  return <div className="mx-auto w-[360px] pt-8"><QrPairingCard payload={payload} error={error} /></div>;
}

const element = document.getElementById("root");
if (!element) throw new Error("Fixture root missing");
const qr = new URLSearchParams(location.search).get("mode") === "qr";
if (qr) {
  let finish = () => {};
  const ready = new Promise<void>((resolve) => { finish = resolve; });
  const original = QRCodeStyling.prototype.getRawData;
  QRCodeStyling.prototype.getRawData = async function (extension) {
    await ready;
    return original.call(this, extension);
  };
  window.addEventListener("fixture-qr-rendered", () => finish(), { once: true });
}
createRoot(element).render(qr ? <QrFixture /> : <App />);
