import type { JSX } from "react";

import {
  BackHeader,
  Badge,
  Btn,
  InfoRow,
  ScannerFrame,
  SuccessCircle,
  VehicleIdentity,
} from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";

export function CheckInKeyScanStep({
  mode = "live",
  keyScanDone,
  keySlotCode,
  make,
  model,
  color,
  plate,
  isSubmitting,
  error,
  onChangeKeySlotCode,
  onSimulateScan,
  onManualEntry,
  onAssignKey,
  onScanAnother,
  onBack,
}: {
  readonly color?: string | null | undefined;
  readonly error?: string | null | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly keyScanDone: boolean;
  readonly keySlotCode: string;
  readonly make?: string | null | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly model?: string | null | undefined;
  readonly onAssignKey: () => void;
  readonly onBack: () => void;
  readonly onChangeKeySlotCode: (code: string) => void;
  readonly onManualEntry: () => void;
  readonly onScanAnother: () => void;
  readonly onSimulateScan?: (() => void) | undefined;
  readonly plate?: string | null | undefined;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const displayModel = make && model ? `${make} ${model}` : (make || model || t.vehicle);

  return (
    <div>
      <BackHeader title={t.assignKey} onBack={onBack} />
      {error && (
        <div className="mx-5 mt-3 p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
          {error}
        </div>
      )}
      {!keyScanDone ? (
        <>
          <ScannerFrame
            label={t.scanKeyQr}
            sublabel={t.positionQr}
          />
          <div className="p-5 space-y-3">
            {mode === "prototype" && onSimulateScan && (
              <Btn label={t.simulateKeyQr} onClick={onSimulateScan} />
            )}
            <Btn
              label={t.enterKeyManually}
              variant={mode === "prototype" ? "secondary" : "primary"}
              onClick={onManualEntry}
            />
          </div>
        </>
      ) : (
        <div className="p-5 space-y-5">
          <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 text-center">
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              {t.keySlot}
            </p>
            <input
              value={keySlotCode}
              dir="ltr"
              onChange={(e) => onChangeKeySlotCode(e.target.value)}
              placeholder={t.enterKeySlotCode}
              className="w-full text-center font-heading font-bold text-[40px] text-navy bg-transparent focus:outline-none"
            />
          </div>
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity
              color={color ?? t.notSpecified}
              model={displayModel}
              plate={plate ?? t.noPlate}
            />
          </div>
          <Btn
            label={isSubmitting ? t.assigningKey : t.assignKey}
            onClick={onAssignKey}
            variant="success"
            disabled={Boolean(isSubmitting) || keySlotCode.trim() === ""}
          />
          <Btn
            label={t.scanAnotherKey}
            variant="secondary"
            size="md"
            onClick={onScanAnother}
            disabled={isSubmitting ?? false}
          />
        </div>
      )}
    </div>
  );
}

export function CheckInKeyAssignedStep({
  keySlotCode,
  make,
  model,
  color,
  plate,
  isSubmitting,
  error,
  onCreateParkingTask,
}: {
  readonly color?: string | null | undefined;
  readonly error?: string | null | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly keySlotCode: string;
  readonly make?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly onCreateParkingTask: () => void;
  readonly plate?: string | null | undefined;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const displayModel = make && model ? `${make} ${model}` : (make || model || t.vehicle);

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <SuccessCircle />
      <div className="text-center">
        <p className="font-heading font-bold text-2xl text-navy">
          {t.key} <bdi dir="ltr">{keySlotCode}</bdi> {t.assignedKey}
        </p>
        <p className="text-neutral text-sm mt-1">
          {t.keySlotLinked}
        </p>
      </div>
      {error && (
        <div className="w-full p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs text-center">
          {error}
        </div>
      )}
      <div className="w-full bg-white rounded-2xl border border-vborder p-5">
        <VehicleIdentity
          color={color ?? t.notSpecified}
          model={displayModel}
          plate={plate ?? t.noPlate}
        />
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-vborder">
          <span className="text-neutral text-sm">{t.keySlot}</span>
          <span dir="ltr" className="bg-navy-3 text-white font-heading font-bold text-sm px-3 py-1.5 rounded-lg">
            {keySlotCode}
          </span>
        </div>
      </div>
      <div className="w-full">
        <Btn
          label={isSubmitting ? t.creatingTask : t.createParkingTask}
          onClick={onCreateParkingTask}
          disabled={isSubmitting ?? false}
        />
      </div>
    </div>
  );
}

export function CheckInParkingTaskStep({
  keySlotCode,
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
  readonly keySlotCode: string;
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
        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label={t.keySlot} value={<bdi dir="ltr">{keySlotCode || t.notAssigned}</bdi>} />
        </div>
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
