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
    color: "#1f9e93",
    roundSize: true,
  },
  cornersSquareOptions: {
    type: "extra-rounded",
    color: "#e8503f",
  },
  cornersDotOptions: {
    type: "dot",
    color: "#e8503f",
  },
  // Dark modules on white: the Android zxing scanner cannot read inverted codes.
  // Brand colours are darkened so they still binarize as dark.
  backgroundOptions: {
    color: "#ffffff",
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
      if (width < 32 || height < 32) return;
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
          className="h-full max-w-full overflow-hidden rounded-3xl ring-1 ring-border"
          ref={containerRef}
          role="img"
        />
        <div className="pointer-events-none absolute -inset-24 rounded-full bg-[radial-gradient(circle,rgba(46,196,182,0.06),transparent_65%)] transition-all duration-700 ease-out group-hover:bg-[radial-gradient(circle,rgba(46,196,182,0.16),transparent_65%)]" />
      </div>
    </div>
  );
}
