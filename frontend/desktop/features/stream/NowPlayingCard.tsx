import { useEffect, useState } from "react";
import { Music, Pause, Play } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Card, CardContent } from "@shared/components/ui/card";

interface MediaState {
  title: string | null;
  artist: string | null;
  album: string | null;
  is_playing: boolean;
  position_ms: number | null;
  duration_ms: number | null;
  app_name: string | null;
}

export function NowPlayingCard() {
  const [media, setMedia] = useState<MediaState | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<MediaState>("media-changed", (event) => {
      setMedia(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

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

  const progress =
    media.duration_ms && media.position_ms
      ? Math.round((media.position_ms / media.duration_ms) * 100)
      : 0;

  const formatTime = (ms: number | null) => {
    if (!ms) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
              {media.is_playing ? (
                <Play className="size-4 text-green-500" />
              ) : (
                <Pause className="size-4 text-yellow-500" />
              )}
              <span className="text-sm text-muted-foreground">
                {media.is_playing ? "Playing" : "Paused"}
                {media.app_name ? ` • ${media.app_name}` : ""}
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
        {media.duration_ms ? (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(media.position_ms)}</span>
              <span>{formatTime(media.duration_ms)}</span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
