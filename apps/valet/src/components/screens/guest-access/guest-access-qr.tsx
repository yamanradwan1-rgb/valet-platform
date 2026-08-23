"use client";

import { useEffect, useState, type JSX } from "react";
import QRCode from "qrcode";

/**
 * High-contrast QR of the exact canonical guest URL. The token itself is
 * never rendered as text; the QR encodes the full shareable URL only.
 */
export function GuestAccessQr({
  alt,
  url,
}: {
  readonly alt: string;
  readonly url: string;
}): JSX.Element | null {
  // Render-phase reset keeps generation state aligned with the current URL
  // without synchronous setState inside an effect.
  const [generated, setGenerated] = useState<{
    dataUrl: string | null;
    failed: boolean;
    url: string;
  }>({ dataUrl: null, failed: false, url });

  if (generated.url !== url) {
    setGenerated({ dataUrl: null, failed: false, url });
  }

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      color: { dark: "#07111fff", light: "#ffffffff" },
      errorCorrectionLevel: "M",
      margin: 4,
      width: 480,
    })
      .then((dataUrl) => {
        if (active) setGenerated((g) => ({ ...g, dataUrl }));
      })
      .catch(() => {
        if (active) setGenerated((g) => ({ ...g, failed: true }));
      });
    return () => {
      active = false;
    };
  }, [url]);

  if (generated.failed || generated.dataUrl === null) return null;

  return (
    <div className="flex justify-center">
      <img
        alt={alt}
        className="rounded-xl border border-vborder bg-white p-2"
        height={220}
        src={generated.dataUrl}
        width={220}
      />
    </div>
  );
}
