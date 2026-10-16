import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../frontend/web/client/App";
import { useWebBackgroundPlayback } from "../../frontend/web/client/features/playback/web-background-playback";

function PlaybackFixture() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantsPlaybackRef = useRef(true);
  const [playing, setPlaying] = useState(true);
  const [recoveries, setRecoveries] = useState(0);
  const [plays, setPlays] = useState(0);
  const [connected, setConnected] = useState(true);
  useWebBackgroundPlayback({ audioRef, wantsPlaybackRef, isConnected: connected, isPlaying: playing, desktopMedia: null,
    onPlay: () => { wantsPlaybackRef.current = true; setPlaying(true); },
    onPause: () => { wantsPlaybackRef.current = false; setPlaying(false); },
    onStop: () => { wantsPlaybackRef.current = false; setConnected(false); setPlaying(false); },
    onRecover: () => setRecoveries((value) => value + 1),
  });
  return <div>
    <audio ref={(audio) => {
      audioRef.current = audio;
      if (audio) {
        audio.play = async () => { setPlays((value) => value + 1); };
        Object.defineProperty(audio, "paused", { configurable: true, get: () => !playing });
      }
    }}><track kind="captions" /></audio>
    <output>{JSON.stringify({ playing, plays, recoveries, connected })}</output>
    <button type="button" onClick={() => setPlaying(false)}>Simulate interruption</button>
    <button type="button" onClick={() => { wantsPlaybackRef.current = false; setPlaying(false); }}>User pause</button>
  </div>;
}

export function mount(mode: "hook" | "app" = "hook") {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  createRoot(container).render(mode === "app" ? <App /> : <PlaybackFixture />);
}
