import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent } from "@shared/components/ui/card";
import { commands, type MediaState } from "@shared/bindings/tauri";

const TICK_MS = 250;

type Anchor = {
  basePositionMs: number;
  startedAt: number;
};

export function NowPlayingCard() {
  const [media, setMedia] = useState<MediaState | null>(null);
  const [livePositionMs, setLivePositionMs] = useState<number | null>(null);
  const lastRef = useRef<MediaState | null>(null);
  const anchorRef = useRef<Anchor | null>(null);
  const playingRef = useRef<boolean>(false);

  // Reset the timer anchor whenever the backend reports a new position or play state.
  const applyAnchor = useCallback((state: MediaState) => {
    playingRef.current = state.isPlaying;
    anchorRef.current = {
      basePositionMs: state.positionMs ?? 0,
      startedAt: performance.now(),
    };
    setLivePositionMs(state.positionMs ?? 0);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<MediaState>("media-changed", (event) => {
      const next = event.payload;
      // Safety net: if the event has no duration but the previous one did,
      // keep the previous duration to avoid hiding the seekbar during a
      // metadata transition.
      const merged =
        !next.durationMs && lastRef.current?.durationMs
          ? { ...next, durationMs: lastRef.current.durationMs }
          : next;
      lastRef.current = merged;
      setMedia(merged);
      applyAnchor(merged);
    }).then((fn) => {
      unlisten = fn;
    });

    // Fetch the current state to handle the race where the backend
    // emitted before this listener was attached.
    void commands.mediaGetState().then((state) => {
      if (state) {
        lastRef.current = state;
        setMedia(state);
        applyAnchor(state);
      }
    });

    return () => {
      unlisten?.();
    };
  }, [applyAnchor]);

  // Tick the timer forward locally while playing.
  useEffect(() => {
    if (!media?.isPlaying) return;
    const id = window.setInterval(() => {
      const anchor = anchorRef.current;
      if (!anchor || !playingRef.current) return;
      const elapsed = performance.now() - anchor.startedAt;
      setLivePositionMs(anchor.basePositionMs + elapsed);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [media?.isPlaying]);

  if (!media?.title) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Music className="size-5" />
          </div>
          <div>
            <div className="text-base font-semibold">No media playing</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const positionMs = livePositionMs ?? media.positionMs ?? 0;
  const progress =
    media.durationMs && positionMs
      ? Math.min(100, Math.round((positionMs / media.durationMs) * 100))
      : 0;

  const formatTime = (ms: number | null) => {
    if (!ms) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleToggle = () => {
    void commands.mediaToggle();
  };

  const handleNext = () => {
    void commands.mediaNext();
  };

  const handlePrevious = () => {
    void commands.mediaPrevious();
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Music className="size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {media.isPlaying ? (
                <Play className="size-4 text-green-500" />
              ) : (
                <Pause className="size-4 text-yellow-500" />
              )}
              <span className="text-sm text-muted-foreground">
                {media.isPlaying ? "Playing" : "Paused"}
                {media.appName ? ` • ${media.appName}` : ""}
              </span>
            </div>
            <div className="mt-1 truncate text-base font-semibold">{media.title}</div>
            {media.artist ? (
              <div className="truncate text-sm text-muted-foreground">{media.artist}</div>
            ) : null}
            {media.album ? (
              <div className="truncate text-sm text-muted-foreground">{media.album}</div>
            ) : null}
          </div>
        </div>
        {media.durationMs ? (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(positionMs)}</span>
              <span>{formatTime(media.durationMs)}</span>
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" onClick={handlePrevious} aria-label="Previous track">
            <SkipBack className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggle}
            aria-label={media.isPlaying ? "Pause" : "Play"}
            className="size-10"
          >
            {media.isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleNext} aria-label="Next track">
            <SkipForward className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
