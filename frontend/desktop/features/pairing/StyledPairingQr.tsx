import { useEffect, useRef } from "react";
import QRCodeStyling, { type Options } from "qr-code-styling";

type StyledPairingQrProps = {
  value: string;
};

const qrSize = 460;

const qrOptions: Options = {
  width: qrSize,
  height: qrSize,
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

    if (!container) {
      return;
    }

    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling({
        ...qrOptions,
        data: value,
      });
      qrRef.current.append(container);
      return;
    }

    qrRef.current.update({ data: value });
  }, [value]);

  return (
    <div className="flex aspect-square w-[min(70vh,calc(100%-0.5rem),620px)] max-w-full min-w-64 items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,rgba(134,213,205,0.1),rgba(134,213,205,0.028)_56%,transparent_72%)] p-2 opacity-95 transition-[background,opacity,transform] duration-700 ease-out hover:scale-[1.008] hover:bg-[radial-gradient(circle_at_center,rgba(134,213,205,0.14),rgba(134,213,205,0.04)_56%,transparent_72%)] hover:opacity-100">
      <div
        aria-label="Eko pairing QR code"
        className="size-full [&>svg]:block [&>svg]:size-full"
        ref={containerRef}
        role="img"
      />
    </div>
  );
}
