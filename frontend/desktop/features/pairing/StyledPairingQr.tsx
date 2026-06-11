import { useEffect, useRef } from "react";
import QRCodeStyling, { type Options } from "qr-code-styling";

type StyledPairingQrProps = {
  value: string;
};

const qrOptions: Options = {
  width: 460,
  height: 460,
  type: "svg",
  shape: "square",
  margin: 16,
  qrOptions: {
    errorCorrectionLevel: "Q",
  },
  dotsOptions: {
    type: "rounded",
    color: "#86d5cd",
    roundSize: true,
  },
  cornersSquareOptions: {
    type: "extra-rounded",
    color: "#a7e4dd",
  },
  cornersDotOptions: {
    type: "dot",
    color: "#a7e4dd",
  },
  backgroundOptions: {
    color: "transparent",
  },
};

export function StyledPairingQr({ value }: StyledPairingQrProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const size = Math.max(1, Math.floor(Math.min(width, height)));

      if (qrRef.current) {
        qrRef.current.update({
          width: size,
          height: size,
          data: value,
        });
      } else {
        qrRef.current = new QRCodeStyling({
          ...qrOptions,
          width: size,
          height: size,
          data: value,
        });
        qrRef.current.append(container);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [value]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="group relative aspect-square h-full max-w-full transition-transform duration-700 ease-out hover:scale-[1.008]">
        <div
          aria-label="Eko pairing QR code"
          className="h-full max-w-full"
          ref={containerRef}
          role="img"
        />
        <div className="pointer-events-none absolute -inset-32 rounded-full bg-[radial-gradient(circle_at_center,rgba(134,213,205,0.04),rgba(134,213,205,0.032)_12%,rgba(134,213,205,0.024)_25%,rgba(134,213,205,0.016)_40%,rgba(134,213,205,0.009)_55%,rgba(134,213,205,0.004)_72%,rgba(134,213,205,0.001)_88%,transparent_100%)] transition-all duration-700 ease-out group-hover:bg-[radial-gradient(circle_at_center,rgba(134,213,205,0.22),rgba(134,213,205,0.18)_12%,rgba(134,213,205,0.13)_25%,rgba(134,213,205,0.085)_40%,rgba(134,213,205,0.045)_55%,rgba(134,213,205,0.02)_72%,rgba(134,213,205,0.005)_88%,transparent_100%)]" />
      </div>
    </div>
  );
}
