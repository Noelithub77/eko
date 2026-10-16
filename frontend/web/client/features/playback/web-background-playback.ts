import { useEffect, useRef, type RefObject } from "react";
import type { WebNowPlayingState } from "@shared/types/web-now-playing";
import ekoLogoUrl from "../../../../../rust/icons/icon.png";

type PlaybackAction = () => void;

type WebBackgroundPlaybackInput = {
  audioRef: RefObject<HTMLAudioElement | null>;
  wantsPlaybackRef: RefObject<boolean>;
  isConnected: boolean;
  isPlaying: boolean;
  desktopMedia: WebNowPlayingState | null;
  onPlay: PlaybackAction;
  onPause: PlaybackAction;
  onStop: PlaybackAction;
  onRecover: PlaybackAction;
};

export function useWebBackgroundPlayback(input: WebBackgroundPlaybackInput): void {
  const latestInputRef = useRef(input);
  useEffect(() => { latestInputRef.current = input; }, [input]);

  useEffect(() => {
    setAudioSessionType(input.isConnected ? "playback" : "auto");
    return () => setAudioSessionType("auto");
  }, [input.isConnected]);

  useEffect(() => {
    const title = input.desktopMedia?.title;
    document.title = title ? `${title} • eko` : "eko • Web receiver";
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title ?? "eko audio stream",
      artist: input.desktopMedia?.artist ?? "eko",
      album: input.desktopMedia?.album ?? (input.desktopMedia?.appName ? `From ${input.desktopMedia.appName}` : "Desktop audio relay"),
      artwork: [{ src: ekoLogoUrl, sizes: "512x512", type: "image/png" }],
    });
  }, [input.desktopMedia]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = input.isConnected ? input.isPlaying ? "playing" : "paused" : "none";
    }
  }, [input.isConnected, input.isPlaying]);

  useEffect(() => {
    setMediaActionHandler("play", () => latestInputRef.current.onPlay());
    setMediaActionHandler("pause", () => latestInputRef.current.onPause());
    setMediaActionHandler("stop", () => latestInputRef.current.onStop());
    return () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      }
      document.title = "eko • Web receiver";
      setMediaActionHandler("play", null);
      setMediaActionHandler("pause", null);
      setMediaActionHandler("stop", null);
    };
  }, []);

  useEffect(() => {
    const recover = (): void => {
      const latest = latestInputRef.current;
      latest.onRecover();
      // Visibility alone must never pause healthy media or override a user's pause.
      if (latest.isConnected && latest.wantsPlaybackRef.current && latest.audioRef.current?.paused && !audioSessionInterrupted()) {
        void latest.audioRef.current.play().catch((error: unknown) => {
          console.warn("[eko] web audio resume needs a Play gesture:", error);
        });
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === "visible") recover();
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("resume", recover);
    window.addEventListener("focus", recover);
    window.addEventListener("pageshow", recover);
    window.addEventListener("online", recover);
    // Timers may be throttled or frozen; lifecycle events also recover immediately.
    const timer = window.setInterval(() => latestInputRef.current.onRecover(), 5_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("resume", recover);
      window.removeEventListener("focus", recover);
      window.removeEventListener("pageshow", recover);
      window.removeEventListener("online", recover);
    };
  }, []);
}

function audioSessionInterrupted(): boolean {
  if (!("audioSession" in navigator)) return false;
  const session = navigator.audioSession;
  return typeof session === "object" && session !== null && "state" in session && session.state === "interrupted";
}

function setAudioSessionType(type: "auto" | "playback"): void {
  if (!("audioSession" in navigator)) return;
  const session = navigator.audioSession;
  if (typeof session !== "object" || session === null || !("type" in session)) return;
  try {
    session.type = type;
  } catch {
    // Experimental Audio Session support can reject an otherwise valid request.
  }
}

function setMediaActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Some browsers expose Media Session but not every action.
  }
}
