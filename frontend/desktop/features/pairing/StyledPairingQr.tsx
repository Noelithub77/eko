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
        <div className="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(134,213,205,0.07),rgba(134,213,205,0.03)_40%,rgba(134,213,205,0.008)_70%,transparent_100%)] transition-[background] duration-700 ease-out group-hover:bg-[radial-gradient(circle_at_center,rgba(134,213,205,0.14),rgba(134,213,205,0.06)_40%,rgba(134,213,205,0.015)_70%,transparent_100%)]" />
      </div>
    </div>
  );
}
