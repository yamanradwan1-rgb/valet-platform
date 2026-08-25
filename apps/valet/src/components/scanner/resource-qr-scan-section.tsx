"use client";

import { useCallback, type JSX } from "react";

import { parseResourceQr, type QrResourceKind } from "../../features/scanner/qr-resource-payload";
import { useQrScannerCapture } from "../../features/scanner/use-qr-scanner-capture";
import { QrCameraView, type QrCameraViewStatus } from "./qr-camera-view";
import type { EmployeeDictionary } from "../../lib/i18n/dictionary";

export interface ResourceQrScanLabels {
  readonly startLabel: string;
  readonly closeLabel: string;
  readonly startingLabel: string;
  readonly scanningHintLabel: string;
  readonly manualHintLabel: string;
  readonly wrongTypeMessage: string;
  readonly unreadableMessage: string;
  readonly unsupportedMessage: string;
  readonly deniedMessage: string;
  readonly busyMessage: string;
  readonly noDeviceMessage: string;
  readonly errorMessage: string;
}

/** Localized label set for one resource kind (DEC-067 §2/§4/§7). */
export function resourceQrScanLabels(
  t: EmployeeDictionary,
  kind: QrResourceKind,
): ResourceQrScanLabels {
  return {
    busyMessage: t.scannerCameraBusy,
    closeLabel: t.scannerCloseScanner,
    deniedMessage: t.scannerCameraPermissionDenied,
    errorMessage: t.scannerCameraError,
    manualHintLabel: t.scannerManualAlwaysAvailable,
    noDeviceMessage: t.scannerNoCameraFound,
    scanningHintLabel: t.scannerScanningHint,
    startingLabel: t.scannerStartingCamera,
    startLabel: t.scannerStartScan,
    unsupportedMessage: t.scannerCameraUnavailable,
    unreadableMessage: t.scannerUnreadableQr,
    wrongTypeMessage:
      kind === "parking-spot"
        ? t.scannerWrongTypeParkingSpot
        : t.scannerWrongTypeKeySlot,
  };
}

export interface ResourceQrScanSectionProps {
  readonly expectedKind: QrResourceKind;
  readonly labels: ResourceQrScanLabels;
  /** Receives the byte-exact resource code of the single accepted decode. */
  readonly onDecoded: (resourceCode: string) => void;
}

export function ResourceQrScanSection({
  expectedKind,
  labels,
  onDecoded,
}: ResourceQrScanSectionProps): JSX.Element {
  const interpret = useCallback(
    (text: string) => {
      const parsed = parseResourceQr(text, expectedKind);
      return parsed.ok
        ? ({ ok: true as const, value: parsed.payload.resourceCode })
        : ({ ok: false as const, reason: parsed.reason });
    },
    [expectedKind],
  );

  const scanner = useQrScannerCapture<string>({
    interpret,
    onDecoded,
  });

  const status: QrCameraViewStatus =
    scanner.rejectionReason !== null
      ? {
          kind: "rejected",
          message:
            scanner.rejectionReason === "wrong-type"
              ? labels.wrongTypeMessage
              : labels.unreadableMessage,
        }
      : scanner.uiState === "starting"
        ? { kind: "starting" }
        : scanner.uiState === "scanning"
          ? { kind: "scanning" }
          : {
              kind: "rejected",
              message: failureMessageFor(scanner.uiState, labels),
            };

  return (
    <div className="px-5 pt-4 space-y-3">
      {scanner.uiState === "idle" ? (
        <button
          type="button"
          data-testid="qr-scan-start"
          onClick={() => {
            void scanner.start();
          }}
          className="w-full h-12 bg-navy text-white font-semibold text-sm rounded-xl active:bg-navy-3 transition-colors cursor-pointer"
        >
          {labels.startLabel}
        </button>
      ) : (
        <>
          <QrCameraView
            closeLabel={labels.closeLabel}
            onClose={scanner.close}
            startingLabel={labels.startingLabel}
            status={status}
            videoRef={scanner.videoRef}
          />
          {scanner.uiState === "scanning" && (
            <p className="text-muted text-xs text-center font-semibold">
              {labels.scanningHintLabel}
            </p>
          )}
        </>
      )}
      <p
        className="text-neutral text-xs text-center"
        data-testid="qr-manual-fallback-hint"
      >
        {labels.manualHintLabel}
      </p>
    </div>
  );
}

function failureMessageFor(
  uiState: string,
  labels: ResourceQrScanLabels,
): string {
  switch (uiState) {
    case "unsupported":
      return labels.unsupportedMessage;
    case "denied":
      return labels.deniedMessage;
    case "busy":
      return labels.busyMessage;
    case "no-device":
      return labels.noDeviceMessage;
    default:
      return labels.errorMessage;
  }
}
