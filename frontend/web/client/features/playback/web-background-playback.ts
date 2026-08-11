import { useEffect, useRef, type RefObject } from "react";
import type { WebNowPlayingState } from "@shared/types/web-now-playing";
import ekoLogoUrl from "../../../../../rust/icons/icon.png";

type PlaybackAction = () => void;

type WebBackgroundPlaybackInput = {
  audioRef: RefObject<HTMLAudioElement | null>;
  isConnected: boolean;
  isPlaying: boolean;
  desktopMedia: WebNowPlayingState | null;
  onPlay: PlaybackAction;
  onPause: PlaybackAction;
  onStop: PlaybackAction;
  onRecover: PlaybackAction;
};

type EkoAudioSession = {
  type: "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record";
};

type EkoNavigatorWithAudioSession = Navigator & {
  audioSession?: EkoAudioSession;
};

export function useWebBackgroundPlayback(input: WebBackgroundPlaybackInput): void {
  const latestInputRef = useRef(input);

  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);

  useEffect(() => {
    setAudioSessionType(input.isConnected ? "playback" : "auto");

    return () => setAudioSessionType("auto");
  }, [input.isConnected]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: input.desktopMedia?.title ?? "Eko audio stream",
      artist: input.desktopMedia?.artist ?? "Eko",
      album:
        input.desktopMedia?.album ??
        (input.desktopMedia?.appName
          ? `From ${input.desktopMedia.appName}`
          : "Desktop audio relay"),
      artwork: [
        {
          src: ekoLogoUrl,
          sizes: "512x512",
          type: "image/png",
        },
      ],
    });
    navigator.mediaSession.playbackState = input.isConnected
      ? input.isPlaying
        ? "playing"
        : "paused"
      : "none";

    const pageTitle = input.desktopMedia?.title
      ? `${input.desktopMedia.title} • Eko`
      : "Eko • Streaming from this device";
    document.title = pageTitle;

    setMediaActionHandler("play", () => latestInputRef.current.onPlay());
    setMediaActionHandler("pause", () => latestInputRef.current.onPause());
    setMediaActionHandler("stop", () => latestInputRef.current.onStop());

    return () => {
      navigator.mediaSession.playbackState = "none";
      document.title = "Eko Client";
      setMediaActionHandler("play", null);
      setMediaActionHandler("pause", null);
      setMediaActionHandler("stop", null);
    };
  }, [input.desktopMedia, input.isConnected, input.isPlaying]);

  useEffect(() => {
    const recoverIfNeeded = (): void => {
      const latestInput = latestInputRef.current;
      if (document.visibilityState !== "visible") {
        return;
      }

      if (latestInput.isConnected && latestInput.isPlaying) {
        void latestInput.audioRef.current?.play().catch((error: unknown) => {
          console.warn("[eko] web background resume failed:", error);
        });
      }

      latestInput.onRecover();
    };

    document.addEventListener("visibilitychange", recoverIfNeeded);
    window.addEventListener("focus", recoverIfNeeded);
    window.addEventListener("pageshow", recoverIfNeeded);

    return () => {
      document.removeEventListener("visibilitychange", recoverIfNeeded);
      window.removeEventListener("focus", recoverIfNeeded);
      window.removeEventListener("pageshow", recoverIfNeeded);
    };
  }, []);
}

function setAudioSessionType(type: EkoAudioSession["type"]): void {
  const audioNavigator = navigator as EkoNavigatorWithAudioSession;

  if (!audioNavigator.audioSession) {
    return;
  }

  audioNavigator.audioSession.type = type;
}

function setMediaActionHandler(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Some browsers expose Media Session but not every action.
  }
}
