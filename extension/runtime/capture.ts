import type { CaptureSource } from "./messages";

type PickedSource = Exclude<CaptureSource, "tab">;
export type CaptureRequest = { source: "tab"; streamId: string; tabId: number; tabTitle: string } | { source: PickedSource };
export type Capture = { stream: MediaStream; tabId: number | null; title: string };

type TabConstraints = MediaStreamConstraints & { audio: { mandatory: { chromeMediaSource: "tab"; chromeMediaSourceId: string } } };
// Chrome picker hints that the bundled DOM typings do not list yet.
type DisplayOptions = DisplayMediaStreamOptions & {
  selfBrowserSurface?: "include" | "exclude"; systemAudio?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude"; windowAudio?: "exclude" | "window" | "system";
};

const picked: Record<PickedSource, { options: DisplayOptions; title: string }> = {
  otherTab: { title: "Shared tab", options: { video: { displaySurface: "browser" }, audio: true,
    selfBrowserSurface: "exclude", monitorTypeSurfaces: "exclude", systemAudio: "exclude" } },
  window: { title: "Shared window", options: { video: { displaySurface: "window" }, audio: true,
    windowAudio: "window", monitorTypeSurfaces: "exclude", systemAudio: "exclude" } },
  screen: { title: "System audio", options: { video: { displaySurface: "monitor" }, audio: true,
    systemAudio: "include", monitorTypeSurfaces: "include" } },
};

export async function openCapture(request: CaptureRequest): Promise<Capture> {
  if (request.source === "tab") {
    const constraints: TabConstraints = { audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: request.streamId } }, video: false };
    return { stream: await navigator.mediaDevices.getUserMedia(constraints), tabId: request.tabId, title: request.tabTitle };
  }
  const { options, title } = picked[request.source];
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getDisplayMedia(options); } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("Sharing was cancelled.");
    throw error;
  }
  // Chrome's picker always captures a picture; only the audio is streamed.
  for (const track of stream.getVideoTracks()) { track.stop(); stream.removeTrack(track); }
  if (!stream.getAudioTracks().length) {
    throw new Error("No audio was shared. Turn on audio in Chrome's picker. Some systems can't share window or screen audio.");
  }
  return { stream, tabId: null, title };
}
