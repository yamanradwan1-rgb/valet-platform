"use client";

import { type JSX } from "react";

import {
  BackHeader,
  Badge,
  Btn,
  VehicleIdentity,
} from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import type {
  StartParkingPayload,
  UseCheckInResult,
} from "../../../features/check-in";
import type { Screen } from "../../../types/employee-ui";

export interface CheckInLateStepsProps {
  readonly checkIn: UseCheckInResult;
  readonly displayColor: string | null;
  readonly displayMake: string | null;
  readonly displayModel: string | null;
  readonly displayPlate: string;
  readonly localizedError: string | null;
  readonly nav: (s: Screen) => void;
  readonly onOpenGuestAccess?: ((sessionId: string) => void) | undefined;
  readonly onStartParkingSuccess?: ((payload: StartParkingPayload) => void) | undefined;
}

/**
 * Late Check-In composition (DEC-068 §5/§23): the normal path has NO
 * pre-Parking Key Slot step, so a completed condition lands directly on the
 * Parking Task launch step with its secondary, non-blocking Guest Access
 * entry point. Start Parking remains the primary action and works without
 * Guest Access. Key Slot intentionally has NO presence here: its first UI
 * appearance is the post-parking deposit/scan step (DEC-068 review fix).
 */
export function CheckInLateSteps({
  checkIn,
  displayColor,
  displayMake,
  displayModel,
  displayPlate,
  localizedError,
  nav,
  onOpenGuestAccess,
  onStartParkingSuccess,
}: CheckInLateStepsProps): JSX.Element | null {
  if (checkIn.step === "parking-task") {
    return (
      <CheckInParkingTaskStep
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

  return null;
}

export function CheckInParkingTaskStep({
  make,
  model,
  color,
  plate,
  isSubmitting,
  error,
  sessionId,
  onOpenGuestAccess,
  onStartParking,
  onBack,
}: {
  readonly color?: string | null | undefined;
  readonly error?: string | null | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly make?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly onBack: () => void;
  readonly onOpenGuestAccess?: (() => void) | undefined;
  readonly onStartParking: () => void;
  readonly plate?: string | null | undefined;
  readonly sessionId?: string | null | undefined;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const displayModel = make && model ? `${make} ${model}` : (make || model || t.vehicle);

  return (
    <div>
      <BackHeader title={t.parkingTask} onBack={onBack} />
      <div className="p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}
        <Badge variant="parking" />
        <VehicleIdentity
          color={color ?? t.notSpecified}
          model={displayModel}
          plate={plate ?? t.noPlate}
        />
        <div className="bg-ice rounded-xl px-4 py-3 flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-vblue flex-shrink-0 mt-px" />
          <p className="text-vblue text-xs font-semibold">
            {t.locationTrackingParking}
          </p>
        </div>
        <Btn
          label={isSubmitting ? t.startingParking : t.startParkingAction}
          onClick={onStartParking}
          disabled={isSubmitting ?? false}
        />
        {sessionId !== undefined &&
        sessionId !== null &&
        sessionId !== "" &&
        onOpenGuestAccess !== undefined && (
          <button
            type="button"
            onClick={onOpenGuestAccess}
            className="w-full bg-white border border-vborder rounded-2xl p-4 text-left active:bg-gray-50 transition-colors cursor-pointer"
          >
            <p className="font-semibold text-sm text-navy">{t.guestAccessTitle}</p>
            <p className="text-muted text-xs mt-0.5">{t.guestAccessEntryHint}</p>
          </button>
        )}
      </div>
    </div>
  );
}
