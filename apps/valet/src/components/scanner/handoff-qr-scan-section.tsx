"use client";

import { useCallback, type JSX } from "react";

import {
  DYNAMIC_QR_PATTERN,
} from "../../features/handoff/handoff-types";
import { useQrScannerCapture } from "../../features/scanner/use-qr-scanner-capture";
import { QrCameraView } from "./qr-camera-view";
import type { EmployeeDictionary } from "../../lib/i18n/dictionary";

export interface HandoffQrScanSectionProps {
  readonly t: EmployeeDictionary;
  /** Receives the raw vhq1.* payload of the single accepted decode. */
  readonly onCaptured: (qrPayload: string) => void;
}

/**
 * Live camera capture for the Dynamic Handoff proof inside an already
 * authorized HANDOFF_PENDING workflow (DEC-067 §5). The scanned text is the
 * RAW existing vhq1.* payload validated against the EXISTING
 * DYNAMIC_QR_PATTERN — never wrapped or re-encoded; scanning alone never
 * verifies anything and the payload only fills the existing proof input.
 */
export function HandoffQrScanSection({
  onCaptured,
  t,
}: HandoffQrScanSectionProps): JSX.Element {
  const interpret = useCallback((text: string) => {
    const candidate = text.trim();
    if (candidate.length === 0) {
      return { ok: false as const, reason: "empty" };
    }
    return DYNAMIC_QR_PATTERN.test(candidate)
      ? ({ ok: true as const, value: candidate })
      : ({ ok: false as const, reason: "invalid-format" });
  }, []);

  const scanner = useQrScannerCapture<string>({
    interpret,
    onDecoded: onCaptured,
  });

  const rejectionMessage =
    scanner.rejectionReason === null ? null : t.scannerWrongTypeHandoff;

  return (
    <div className="space-y-3">
      {scanner.uiState === "idle" ? (
        <button
          type="button"
          data-testid="handoff-qr-scan-start"
          onClick={() => {
            void scanner.start();
          }}
          className="w-full h-11 bg-navy text-white font-semibold text-sm rounded-xl active:bg-navy-3 transition-colors cursor-pointer"
        >
          {t.scannerStartScan}
        </button>
      ) : (
        <QrCameraView
          closeLabel={t.scannerCloseScanner}
          onClose={scanner.close}
          startingLabel={t.scannerStartingCamera}
          status={
            rejectionMessage !== null
              ? { kind: "rejected", message: rejectionMessage }
              : scanner.uiState === "scanning"
                ? { kind: "scanning" }
                : scanner.uiState === "starting"
                  ? { kind: "starting" }
                  : { kind: "rejected", message: failureMessageFor(scanner.uiState, t) }
          }
          videoRef={scanner.videoRef}
        />
      )}
      <p className="text-neutral text-xs" data-testid="handoff-manual-fallback-hint">
        {t.scannerManualAlwaysAvailable}
      </p>
    </div>
  );
}

function failureMessageFor(
  uiState: string,
  t: EmployeeDictionary,
): string {
  switch (uiState) {
    case "unsupported":
      return t.scannerCameraUnavailable;
    case "denied":
      return t.scannerCameraPermissionDenied;
    case "busy":
      return t.scannerCameraBusy;
    case "no-device":
      return t.scannerNoCameraFound;
    default:
      return t.scannerCameraError;
  }
}
