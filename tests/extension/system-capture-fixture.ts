import { openCapture } from "../../extension/runtime/capture";

const audio = new AudioContext();
const destination = audio.createMediaStreamDestination();
const canvas = document.createElement("canvas");
let selected: MediaStream;
let requested: DisplayMediaStreamOptions | undefined;
navigator.mediaDevices.getDisplayMedia = async (options) => { requested = options; return selected; };

function stream(surface: "browser" | "monitor", withAudio: boolean): MediaStream {
  const video = canvas.captureStream().getVideoTracks()[0];
  video.getSettings = () => ({ displaySurface: surface });
  return new MediaStream(withAudio ? [video, destination.stream.getAudioTracks()[0].clone()] : [video]);
}
function check(value: boolean, message: string): void { if (!value) throw new Error(message); }

try {
  selected = stream("browser", true);
  const rejected = selected.getTracks();
  let failure = "";
  try { await openCapture({ source: "screen" }); } catch (error) { failure = error instanceof Error ? error.message : ""; }
  check(failure === "Choose an entire screen to share system audio.", "A tab must not be accepted as the entire system.");
  check(rejected.every((track) => track.readyState === "ended"), "Rejected source tracks must be stopped.");

  selected = stream("monitor", false);
  const silent = selected.getTracks();
  failure = "";
  try { await openCapture({ source: "screen" }); } catch (error) { failure = error instanceof Error ? error.message : ""; }
  check(failure.startsWith("No system audio was shared."), "A screen without audio must fail.");
  check(silent.every((track) => track.readyState === "ended"), "Silent screen capture must be released.");

  selected = stream("monitor", true);
  const video = selected.getVideoTracks()[0];
  const capture = await openCapture({ source: "screen" });
  check(requested?.audio === true && typeof requested.video === "object" && requested.video.displaySurface === "monitor", "System capture must request a screen and audio.");
  check(capture.stream.getVideoTracks().length === 0 && video.readyState === "ended", "Only audio should remain in the shared stream.");
  check(capture.stream.getAudioTracks()[0]?.readyState === "live", "Screen audio must survive stopping video.");
  for (const track of capture.stream.getTracks()) track.stop();
  document.body.dataset.systemCaptureTest = "passed";
} finally {
  for (const track of destination.stream.getTracks()) track.stop();
  await audio.close();
}
