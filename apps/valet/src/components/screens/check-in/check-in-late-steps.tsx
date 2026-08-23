"use client";

import { type JSX } from "react";

import {
  CheckInKeyAssignedStep,
  CheckInKeyScanStep,
  CheckInParkingTaskStep,
} from "./check-in-key-steps";
import type {
  StartParkingPayload,
  UseCheckInResult,
} from "../../../features/check-in";
import type { Screen } from "../../../types/employee-ui";

export interface CheckInLateStepsProps {
  readonly checkIn: UseCheckInResult;
  readonly displayColor: string | null;
  readonly displayKeySlot: string;
  readonly displayMake: string | null;
  readonly displayModel: string | null;
  readonly displayPlate: string;
  readonly keyScanDone: boolean;
  readonly keySlotCode: string;
  readonly localizedError: string | null;
  readonly mode: "live" | "prototype" | undefined;
  readonly nav: (s: Screen) => void;
  readonly onOpenGuestAccess?: ((sessionId: string) => void) | undefined;
  readonly onStartParkingSuccess?: ((payload: StartParkingPayload) => void) | undefined;
  readonly setKeyScanDone: (done: boolean) => void;
  readonly setKeySlotCode: (code: string) => void;
}

/**
 * Late Check-In composition: key scan/assignment and the parking-task launch
 * step with its secondary, non-blocking Guest Access entry point. Start
 * Parking remains the primary action and works without Guest Access.
 */
export function CheckInLateSteps({
  checkIn,
  displayColor,
  displayKeySlot,
  displayMake,
  displayModel,
  displayPlate,
  keyScanDone,
  keySlotCode,
  localizedError,
  mode = "live",
  nav,
  onOpenGuestAccess,
  onStartParkingSuccess,
  setKeyScanDone,
  setKeySlotCode,
}: CheckInLateStepsProps): JSX.Element | null {
  if (checkIn.step === "key-scan") {
    return (
      <CheckInKeyScanStep
        mode={mode}
        keyScanDone={keyScanDone}
        keySlotCode={keySlotCode}
        make={displayMake}
        model={displayModel}
        color={displayColor}
        plate={displayPlate}
        isSubmitting={checkIn.isSubmitting}
        error={localizedError}
        onChangeKeySlotCode={setKeySlotCode}
        onSimulateScan={() => {
          setKeySlotCode("B-214");
          setKeyScanDone(true);
        }}
        onManualEntry={() => setKeyScanDone(true)}
        onAssignKey={async () => {
          await checkIn.assignKey(keySlotCode);
        }}
        onScanAnother={() => setKeyScanDone(false)}
        onBack={() => {
          if (checkIn.activeSession?.state === "AWAITING_PARKING") {
            nav("task-queue");
          } else {
            checkIn.setStep("vehicle-condition");
          }
        }}
      />
    );
  }

  if (checkIn.step === "key-assigned") {
    return (
      <CheckInKeyAssignedStep
        keySlotCode={displayKeySlot}
        make={displayMake}
        model={displayModel}
        color={displayColor}
        plate={displayPlate}
        isSubmitting={checkIn.isSubmitting}
        error={localizedError}
        onCreateParkingTask={async () => {
          await checkIn.createParkingTask();
        }}
      />
    );
  }

  if (checkIn.step === "parking-task") {
    return (
      <CheckInParkingTaskStep
        keySlotCode={displayKeySlot}
        make={displayMake}
        model={displayModel}
        color={displayColor}
        plate={displayPlate}
        isSubmitting={checkIn.isSubmitting}
        error={localizedError}
        sessionId={checkIn.activeSession?.sessionId ?? null}
        onOpenGuestAccess={
          onOpenGuestAccess === undefined
            ? undefined
            : () => {
                const id = checkIn.activeSession?.sessionId;
                if (id !== null && id !== undefined) onOpenGuestAccess(id);
              }
        }
        onStartParking={async () => {
          const payload = await checkIn.startParking();
          if (payload !== null) {
            onStartParkingSuccess?.(payload);
            nav("parking");
          }
        }}
        onBack={() => checkIn.setStep("key-assigned")}
      />
    );
  }

  return null;
}
