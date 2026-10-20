import { useEffect, useRef } from "react";

type AudioWaveVisualizerProps = {
  isPlaying: boolean;
  className?: string;
} & ({ stream: MediaStream | null; levels?: never } | { levels: readonly number[]; stream?: never });

const BAR_COUNT = 48;

export function AudioWaveVisualizer({ stream, levels, isPlaying, className }: AudioWaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<readonly number[]>([]);
  const updatedAtRef = useRef(0);

  useEffect(() => {
    levelsRef.current = levels ?? [];
    updatedAtRef.current = performance.now();
  }, [levels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frame = 0;
    const values = new Uint8Array(64);
    const smoothed = new Float32Array(BAR_COUNT);

    if (stream && isPlaying) {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.85;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      void audioContext.resume().catch(() => {});
    }

    const resume = () => {
      if (audioContext?.state === "suspended") void audioContext.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      analyser?.getByteFrequencyData(values);
      const fresh = performance.now() - updatedAtRef.current < 500;
      for (let i = 0; i < BAR_COUNT; i++) {
        const level = isPlaying ? (analyser ? values[i] / 255 : fresh ? levelsRef.current[i] ?? 0 : 0) : 0;
        smoothed[i] = isPlaying ? smoothed[i] * 0.65 + Math.min(1, Math.max(0, level)) * 0.35 : 0;
        const value = smoothed[i];
        const barWidth = width / BAR_COUNT * 0.6;
        const gap = width / BAR_COUNT * 0.4;
        const barHeight = Math.max(4, value * height * 0.9);
        const t = i / (BAR_COUNT - 1);
        context.beginPath();
        context.roundRect(i * (barWidth + gap) + gap / 2, (height - barHeight) / 2,
          barWidth, barHeight, Math.min(barWidth / 2, 3));
        context.fillStyle = `rgba(${Math.round(255 - 209 * t)}, ${Math.round(107 + 89 * t)}, ${Math.round(91 + 91 * t)}, ${0.3 + value * 0.7})`;
        context.fill();
      }
      if (isPlaying) frame = requestAnimationFrame(draw);
    };
    draw();
    const observer = new ResizeObserver(() => { if (!isPlaying) draw(); });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
      source?.disconnect();
      analyser?.disconnect();
      void audioContext?.close().catch(() => {});
    };
  }, [stream, isPlaying]);

  return <canvas ref={canvasRef} className={className} role="img" aria-label="Live audio waveform"
    style={{ width: "100%", height: "100%" }} />;
}
