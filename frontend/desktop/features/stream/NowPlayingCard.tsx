import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@shared/components/ui/button";
import { commands, type MediaState } from "@shared/bindings/tauri";
import { cn } from "@shared/lib/utils";

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

    listen<MediaState | null>("media-changed", (event) => {
      const next = event.payload;
      if (!next) {
        lastRef.current = null;
        anchorRef.current = null;
        playingRef.current = false;
        setMedia(null);
        setLivePositionMs(null);
        return;
      }
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
      <section>
        <p className="text-sm text-muted-foreground">Now playing</p>
        <h2 className="mt-3 text-[clamp(2.25rem,3.6vw,4.25rem)] font-bold tracking-tight text-muted-foreground/60">
          Nothing playing
        </h2>
      </section>
    );
  }

  const positionMs = livePositionMs ?? media.positionMs ?? 0;
  const progress = media.durationMs ? Math.min(100, (positionMs / media.durationMs) * 100) : 0;

  return (
    <section>
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Equalizer playing={media.isPlaying} />
        <span>
          {media.isPlaying ? "Now playing" : "Paused"}
          {media.appName ? ` · ${media.appName}` : ""}
        </span>
      </div>
      <h2 className="mt-3 line-clamp-2 text-[clamp(2.25rem,3.6vw,4.25rem)] leading-tight font-bold tracking-tight text-balance">
        {media.title}
      </h2>
      {media.artist || media.album ? (
        <p className="mt-3 truncate text-[clamp(1.125rem,1.6vw,1.5rem)] text-muted-foreground">
          {[media.artist, media.album].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      <div className="mt-[clamp(1.5rem,5vh,3.5rem)] w-full">
        {media.durationMs ? (
          <div className="mb-6">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{formatTime(positionMs)}</span>
              <span>{formatTime(media.durationMs)}</span>
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button
            aria-label="Previous track"
            className="text-muted-foreground"
            onClick={() => void commands.mediaPrevious()}
            size="icon-lg"
            variant="ghost"
          >
            <SkipBack className="size-5" />
          </Button>
          <Button
            aria-label={media.isPlaying ? "Pause" : "Play"}
            className="size-16 xl:size-20"
            onClick={() => void commands.mediaToggle()}
          >
            {media.isPlaying ? (
              <Pause className="size-7 fill-current" />
            ) : (
              <Play className="size-7 translate-x-px fill-current" />
            )}
          </Button>
          <Button
            aria-label="Next track"
            className="text-muted-foreground"
            onClick={() => void commands.mediaNext()}
            size="icon-lg"
            variant="ghost"
          >
            <SkipForward className="size-5" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-3.5 items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span
          className={cn(
            "h-full w-[3px] origin-bottom rounded-full",
            playing ? "eko-eq bg-teal" : "scale-y-40 bg-muted-foreground",
          )}
          key={bar}
          style={{ animationDelay: `${bar * -0.35}s` }}
        />
      ))}
    </span>
  );
}

function formatTime(ms: number | null): string {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
