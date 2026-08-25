"use client";

import type { JSX, RefObject } from "react";

/**
 * Presentational live camera preview for QR capture (DEC-067 §2/§3).
 * Truthful localized states only — this component never claims a scan
 * happened. The large Close control is always rendered while the scanner is
 * open, and the parent keeps manual entry available beside it.
 */

export type QrCameraViewStatus =
  | { readonly kind: "starting" }
  | { readonly kind: "scanning" }
  | { readonly kind: "rejected"; readonly message: string };

export interface QrCameraViewProps {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly status: QrCameraViewStatus;
  readonly closeLabel: string;
  readonly startingLabel: string;
  readonly onClose: () => void;
}

function CornerBrackets(): JSX.Element {
  return (
    <div className="relative w-[200px] h-[140px]">
      <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-xl" />
      <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-xl" />
      <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-xl" />
      <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-xl" />
    </div>
  );
}

export function QrCameraView({
  closeLabel,
  onClose,
  startingLabel,
  status,
  videoRef,
}: QrCameraViewProps): JSX.Element {
  const showPreview = status.kind !== "starting";
  return (
    <div>
      <div
        className="relative h-[260px] bg-navy-2 flex items-center justify-center overflow-hidden"
        data-testid="qr-camera-view"
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover ${
            showPreview ? "" : "opacity-0"
          }`}
        />
        {!showPreview && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-xs font-semibold">
              {startingLabel}
            </p>
          </div>
        )}
        {status.kind === "scanning" && <CornerBrackets />}
        {status.kind === "rejected" && (
          <div className="absolute inset-x-4 bottom-4">
            <div className="bg-white/95 rounded-xl px-3 py-2 text-center">
              <p
                className="text-vdanger text-xs font-semibold break-words"
                data-testid="qr-camera-rejection"
              >
                {status.message}
              </p>
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        data-testid="qr-camera-close"
        className="w-full h-14 mt-3 bg-white border-2 border-vdanger text-vdanger font-heading font-bold text-base rounded-2xl active:bg-red-50 transition-colors cursor-pointer"
      >
        {closeLabel}
      </button>
    </div>
  );
}
