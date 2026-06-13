import { useEffect, useRef, type RefObject } from "react";

type PlaybackAction = () => void;

type WebBackgroundPlaybackInput = {
  audioRef: RefObject<HTMLAudioElement | null>;
  isConnected: boolean;
  isPlaying: boolean;
  receiverName: string;
  onPlay: PlaybackAction;
  onPause: PlaybackAction;
  onStop: PlaybackAction;
};

type EkoAudioSession = {
  type: "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record";
};

type EkoNavigatorWithAudioSession = Navigator & {
  audioSession?: EkoAudioSession;
};

type EkoWakeLockSentinel = EventTarget & {
  readonly released: boolean;
  release: () => Promise<void>;
};

type EkoNavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<EkoWakeLockSentinel>;
  };
};

export function useWebBackgroundPlayback(input: WebBackgroundPlaybackInput): void {
  const latestInputRef = useRef(input);
  const wakeLockRef = useRef<EkoWakeLockSentinel | null>(null);

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
      title: "Eko",
      artist: input.receiverName,
      album: "Desktop audio relay",
    });
    navigator.mediaSession.playbackState = input.isPlaying ? "playing" : "paused";

    setMediaActionHandler("play", () => latestInputRef.current.onPlay());
    setMediaActionHandler("pause", () => latestInputRef.current.onPause());
    setMediaActionHandler("stop", () => latestInputRef.current.onStop());

    return () => {
      navigator.mediaSession.playbackState = "none";
      setMediaActionHandler("play", null);
      setMediaActionHandler("pause", null);
      setMediaActionHandler("stop", null);
    };
  }, [input.isPlaying, input.receiverName]);

  useEffect(() => {
    const resumeIfNeeded = (): void => {
      const latestInput = latestInputRef.current;
      if (!latestInput.isConnected || !latestInput.isPlaying) {
        return;
      }

      void latestInput.audioRef.current?.play().catch((error: unknown) => {
        console.warn("[eko] web background resume failed:", error);
      });
    };

    document.addEventListener("visibilitychange", resumeIfNeeded);
    window.addEventListener("focus", resumeIfNeeded);
    window.addEventListener("pageshow", resumeIfNeeded);

    return () => {
      document.removeEventListener("visibilitychange", resumeIfNeeded);
      window.removeEventListener("focus", resumeIfNeeded);
      window.removeEventListener("pageshow", resumeIfNeeded);
    };
  }, []);

  useEffect(() => {
    if (!input.isPlaying) {
      void releaseWakeLock(wakeLockRef);
      return;
    }

    void requestWakeLock(wakeLockRef);

    const requestAgainWhenVisible = (): void => {
      if (document.visibilityState === "visible" && latestInputRef.current.isPlaying) {
        void requestWakeLock(wakeLockRef);
      }
    };

    document.addEventListener("visibilitychange", requestAgainWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", requestAgainWhenVisible);
      void releaseWakeLock(wakeLockRef);
    };
  }, [input.isPlaying]);
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

async function requestWakeLock(wakeLockRef: RefObject<EkoWakeLockSentinel | null>): Promise<void> {
  const wakeLockNavigator = navigator as EkoNavigatorWithWakeLock;

  if (!wakeLockNavigator.wakeLock || wakeLockRef.current) {
    return;
  }

  try {
    const wakeLock = await wakeLockNavigator.wakeLock.request("screen");
    wakeLockRef.current = wakeLock;
    wakeLock.addEventListener("release", () => {
      wakeLockRef.current = null;
    });
  } catch (error: unknown) {
    console.warn("[eko] screen wake lock unavailable:", error);
  }
}

async function releaseWakeLock(wakeLockRef: RefObject<EkoWakeLockSentinel | null>): Promise<void> {
  const wakeLock = wakeLockRef.current;
  wakeLockRef.current = null;

  if (!wakeLock || wakeLock.released) {
    return;
  }

  await wakeLock.release().catch(() => {
    /* The browser may already have released it. */
  });
}
