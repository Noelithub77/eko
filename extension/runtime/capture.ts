import type { CaptureSource } from "./messages";

export type CaptureRequest = { source: "tab"; streamId: string; tabId: number; tabTitle: string } | { source: Exclude<CaptureSource, "tab"> };
export type Capture = { stream: MediaStream; tabId: number | null; title: string };

type TabConstraints = MediaStreamConstraints & { audio: { mandatory: { chromeMediaSource: "tab"; chromeMediaSourceId: string } } };
// Chrome picker hints that the bundled DOM typings do not list yet.
type DisplayOptions = DisplayMediaStreamOptions & {
  systemAudio?: "include" | "exclude"; monitorTypeSurfaces?: "include" | "exclude";
};

const systemOptions: DisplayOptions = {
  video: { displaySurface: "monitor" }, audio: true, systemAudio: "include", monitorTypeSurfaces: "include",
};

export async function openCapture(request: CaptureRequest): Promise<Capture> {
  if (request.source === "tab") {
    const constraints: TabConstraints = { audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: request.streamId } }, video: false };
    return { stream: await navigator.mediaDevices.getUserMedia(constraints), tabId: request.tabId, title: request.tabTitle };
  }
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getDisplayMedia(systemOptions); } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("Sharing was cancelled.");
    throw error;
  }
  if (stream.getVideoTracks()[0]?.getSettings().displaySurface !== "monitor") {
    for (const track of stream.getTracks()) track.stop();
    throw new Error("Choose an entire screen to share system audio.");
  }
  // Chrome's picker always captures a picture; only the audio is streamed.
  for (const track of stream.getVideoTracks()) { track.stop(); stream.removeTrack(track); }
  if (!stream.getAudioTracks().length) {
    throw new Error("No system audio was shared. Turn on audio in Chrome's picker. Some systems don't support it.");
  }
  return { stream, tabId: null, title: "Entire system" };
}
