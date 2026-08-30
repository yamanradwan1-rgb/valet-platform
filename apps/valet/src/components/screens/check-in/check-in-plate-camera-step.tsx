"use client";

import type { JSX } from "react";

import { usePlateCamera } from "../../../features/plate-camera/use-plate-camera";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import { BackHeader, Btn } from "../../ui/employee-primitives";
import { CheckInManualPlateFields } from "./check-in-manual-plate-fields";

export interface CheckInPlateCameraStepProps {
  readonly identityKey?: string | null | undefined;
  readonly onBack: () => void;
  readonly onChangePlateCountry: (country: string) => void;
  readonly onChangePlateNumber: (plate: string) => void;
  readonly onContinue: () => void;
  readonly onManualEntry: () => void;
  readonly onNoPlate: () => void;
  readonly plateCountry: string;
  readonly plateNumber: string;
}

const FAILURE_STATES = new Set([
  "busy",
  "denied",
  "error",
  "insecure-context",
  "no-device",
  "unavailable",
]);

export function CheckInPlateCameraStep({
  identityKey,
  onBack,
  onChangePlateCountry,
  onChangePlateNumber,
  onContinue,
  onManualEntry,
  onNoPlate,
  plateCountry,
  plateNumber,
}: CheckInPlateCameraStepProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const {
    canvasRef,
    capture,
    close,
    retake,
    start,
    state,
    videoRef,
  } = usePlateCamera({ identityKey });
  const isOpen = state !== "idle";
  const isCaptured = state === "captured";
  const hasFailure = FAILURE_STATES.has(state);

  const closeThen = (action: () => void): void => {
    close();
    action();
  };

  return (
    <div>
      <BackHeader
        title={t.scanPlate}
        onBack={() => closeThen(onBack)}
      />
      <div className="p-5 space-y-4">
        {!isOpen ? (
          <>
            <Btn label={t.plateCameraOpen} onClick={start} />
            <Btn
              label={t.enterManually}
              variant="secondary"
              onClick={() => closeThen(onManualEntry)}
            />
            <Btn
              label={t.noPlateUnreadable}
              variant="ghost"
              size="md"
              onClick={() => closeThen(onNoPlate)}
            />
          </>
        ) : (
          <>
            <div className="relative h-[260px] overflow-hidden rounded-2xl bg-navy-2">
              <video
                ref={videoRef}
                aria-label={t.plateCameraPreviewLabel}
                autoPlay
                muted
                playsInline
                className={`absolute inset-0 h-full w-full object-cover ${
                  isCaptured ? "hidden" : ""
                }`}
              />
              <canvas
                ref={canvasRef}
                aria-label={t.plateCameraCapturedLabel}
                role="img"
                className={`h-full w-full object-contain ${
                  isCaptured ? "block" : "hidden"
                }`}
              />
              {state === "starting" && (
                <CameraMessage message={t.plateCameraStarting} />
              )}
              {hasFailure && (
                <CameraMessage message={failureMessage(state, t)} />
              )}
            </div>
            {state === "preview" && (
              <>
                <p className="text-center text-xs text-neutral">
                  {t.plateCameraPreviewHint}
                </p>
                <Btn label={t.plateCameraCapture} onClick={capture} />
              </>
            )}
            {isCaptured && (
              <>
                <p className="text-center text-xs font-semibold text-vsuccess">
                  {t.plateCameraCapturedHint}
                </p>
                <Btn
                  label={t.plateCameraRetake}
                  variant="secondary"
                  onClick={retake}
                />
                <CheckInManualPlateFields
                  onChangePlateCountry={onChangePlateCountry}
                  onChangePlateNumber={onChangePlateNumber}
                  onContinue={() => closeThen(onContinue)}
                  onNoPlate={() => closeThen(onNoPlate)}
                  plateCountry={plateCountry}
                  plateNumber={plateNumber}
                />
              </>
            )}
            {hasFailure && (
              <Btn label={t.plateCameraRetry} onClick={retake} />
            )}
            {!isCaptured && (
              <Btn
                label={t.enterManually}
                variant="secondary"
                onClick={() => closeThen(onManualEntry)}
              />
            )}
            <Btn
              label={t.plateCameraClose}
              variant="ghost"
              size="md"
              onClick={close}
            />
          </>
        )}
      </div>
    </div>
  );
}

function CameraMessage({ message }: { readonly message: string }): JSX.Element {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-5">
      <p className="rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-semibold text-navy">
        {message}
      </p>
    </div>
  );
}

function failureMessage(
  state: string,
  t: ReturnType<typeof useEmployeeI18n>["t"],
): string {
  switch (state) {
    case "denied": return t.plateCameraPermissionDenied;
    case "insecure-context": return t.plateCameraInsecureContext;
    case "unavailable": return t.plateCameraUnavailable;
    case "busy": return t.plateCameraBusy;
    case "no-device": return t.plateCameraNoDevice;
    default: return t.plateCameraError;
  }
}
