import { useEffect, useRef, useSyncExternalStore } from "react";
import QRCodeStyling, { type Options } from "qr-code-styling";

type StyledPairingQrProps = {
  value: string;
  onReady?: (value: string) => void;
  onError?: (message: string) => void;
};

// The code sits straight on the app background. Dark mode makes it light-on-dark,
// which the Android scanner reads by also decoding inverted frames.
const palettes = {
  dark: { dots: "#2ec4b6", eyes: "#ff6b5b" },
  light: { dots: "#15827a", eyes: "#d9442f" },
};

function qrOptions(isDark: boolean, size: number, data: string): Options {
  const palette = isDark ? palettes.dark : palettes.light;
  return {
    width: size,
    height: size,
    data,
    type: "canvas",
    shape: "square",
    // The empty space around the code is the quiet zone.
    margin: 0,
    qrOptions: { errorCorrectionLevel: "M" },
    dotsOptions: { type: "rounded", color: palette.dots, roundSize: true },
    cornersSquareOptions: { type: "extra-rounded", color: palette.eyes },
    cornersDotOptions: { type: "dot", color: palette.eyes },
    backgroundOptions: { color: "transparent" },
  };
}

export function StyledPairingQr({ value, onReady, onError }: StyledPairingQrProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const isDark = useSyncExternalStore(subscribeToTheme, readIsDark);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;
    let generation = 0;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cssSize = Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height));
      if (cssSize < 32) return;
      const draw = ++generation;
      // Draw at device pixels; CSS scales the canvas back to the box.
      const options = qrOptions(isDark, Math.round(cssSize * window.devicePixelRatio), value);

      if (qrRef.current) {
        qrRef.current.update(options);
      } else {
        qrRef.current = new QRCodeStyling(options);
        qrRef.current.append(container);
      }
      void qrRef.current.getRawData("png").then((image) => {
        if (active && draw === generation && image) onReady?.(value);
      }).catch(() => {
        if (active && draw === generation) onError?.("Could not draw the pairing code. Restart the stream to try again.");
      });
    });

    resizeObserver.observe(container);
    return () => { active = false; resizeObserver.disconnect(); };
  }, [isDark, value, onReady, onError]);

  return (
    <div
      aria-label="eko pairing QR code"
      className="aspect-square w-full [&>canvas]:block [&>canvas]:size-full"
      ref={containerRef}
      role="img"
    />
  );
}

function readIsDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
