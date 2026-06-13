import { useCallback, useEffect, useRef } from "react";

interface AudioWaveVisualizerProps {
  stream: MediaStream | null;
  isPlaying: boolean;
  className?: string;
}

export function AudioWaveVisualizer({ stream, isPlaying: _isPlaying, className }: AudioWaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const ensureContextRunning = useCallback(async (ctx: AudioContext): Promise<boolean> => {
    const state = ctx.state as string;
    if (state === "running") return true;
    console.log(`[eko] visualizer: AudioContext suspended, attempting resume...`);
    try {
      await ctx.resume();
      if ((ctx.state as string) === "running") {
        console.log(`[eko] visualizer: AudioContext resumed successfully`);
        return true;
      }
      console.warn(`[eko] visualizer: AudioContext still ${ctx.state} after resume`);
    } catch (err) {
      console.warn(`[eko] visualizer: AudioContext resume failed:`, err);
    }
    return (ctx.state as string) === "running";
  }, []);

  useEffect(() => {
    if (audioContextRef.current) {
      ensureContextRunning(audioContextRef.current).then((ok) => {
        if (!ok) {
          console.warn(`[eko] visualizer: still suspended, add click listener`);
        }
      }).catch(() => {});
    }
  }, [_isPlaying, ensureContextRunning]);

  useEffect(() => {
    if (!stream) {
      console.log("[eko] visualizer: no stream yet, skipping");
      return;
    }

    const audioTracks = stream.getAudioTracks();
    console.log(
      `[eko] visualizer: stream id=${stream.id} audioTracks=${audioTracks.length} active=${stream.active}`,
    );
    for (const track of audioTracks) {
      console.log(
        `[eko] visualizer: track kind=${track.kind} id=${track.id} enabled=${track.enabled} readyState=${track.readyState}`,
      );
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      console.log("[eko] visualizer: canvas ref is null");
      return;
    }

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      console.log("[eko] visualizer: 2d context not available");
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx2d.scale(dpr, dpr);
    console.log(`[eko] visualizer: canvas ${displayWidth}x${displayHeight} dpr=${dpr}`);

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    console.log(`[eko] visualizer: AudioContext created, state=${audioContext.state}`);

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.85;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let firstNonZeroFrame = false;
    let running = true;
    let attemptResume = true;

    const draw = () => {
      if (!running) return;
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const width = displayWidth;
      const height = displayHeight;
      ctx2d.clearRect(0, 0, width, height);

      const barCount = 48;
      const barWidth = (width / barCount) * 0.6;
      const gap = (width / barCount) * 0.4;
      const step = Math.floor(bufferLength / barCount);

      let maxVal = 0;
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[i * step + j];
        }
        const avg = sum / step;
        if (avg > maxVal) maxVal = avg;
        const normalized = avg / 255;
        const barHeight = Math.max(4, normalized * height * 0.9);

        const x = i * (barWidth + gap) + gap / 2;
        const y = (height - barHeight) / 2;

        const alpha = 0.3 + normalized * 0.7;
        const cornerRadius = Math.min(barWidth / 2, 3);

        ctx2d.beginPath();
        ctx2d.roundRect(x, y, barWidth, barHeight, cornerRadius);
        ctx2d.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx2d.fill();
      }

      if (maxVal > 0 && !firstNonZeroFrame) {
        firstNonZeroFrame = true;
        console.log(`[eko] visualizer: first non-zero frame maxVal=${maxVal}`);
      }

      if (attemptResume && (audioContext.state as string) === "suspended") {
        ensureContextRunning(audioContext).then(() => {
          if ((audioContext.state as string) === "running") {
            attemptResume = false;
          }
        }).catch(() => {});
      }
    };

    draw();

    return () => {
      console.log("[eko] visualizer: cleaning up");
      running = false;
      cancelAnimationFrame(animationRef.current);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream, ensureContextRunning]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
