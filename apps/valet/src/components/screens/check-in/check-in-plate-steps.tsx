import type { JSX } from "react";

import {
  BackHeader,
  Btn,
  ScannerFrame,
  VehicleIdentity,
} from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";

export function CheckInPlateScanStep({
  mode = "live",
  scanDone,
  onSimulateScan,
  onManualEntry,
  onBack,
}: {
  readonly mode?: "live" | "prototype" | undefined;
  readonly onBack: () => void;
  readonly onManualEntry: () => void;
  readonly onSimulateScan?: (() => void) | undefined;
  readonly scanDone: boolean;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div>
      <BackHeader title={t.scanPlate} onBack={onBack} />
      <ScannerFrame
        label={t.scanLicensePlate}
        sublabel={t.positionPlate}
        scanned={scanDone}
      />
      <div className="p-5 space-y-3">
        {!scanDone ? (
          <>
            {mode === "prototype" && onSimulateScan && (
              <Btn label={t.simulatePlate} onClick={onSimulateScan} />
            )}
            <Btn
              label={t.enterManually}
              variant={mode === "prototype" ? "secondary" : "primary"}
              onClick={onManualEntry}
            />
          </>
        ) : (
          <div className="text-center py-3">
            <p className="text-vsuccess font-semibold text-sm">
              {t.plateDetected}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function CheckInManualPlateStep({
  plateNumber,
  plateCountry,
  onChangePlateNumber,
  onChangePlateCountry,
  onNoPlate,
  onContinue,
  onBack,
}: {
  readonly onBack: () => void;
  readonly onChangePlateCountry: (country: string) => void;
  readonly onChangePlateNumber: (plate: string) => void;
  readonly onContinue: () => void;
  readonly onNoPlate: () => void;
  readonly plateCountry: string;
  readonly plateNumber: string;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div>
      <BackHeader title={t.enterPlate} onBack={onBack} />
      <div className="p-5 space-y-5">
        <div>
          <label className="text-navy font-semibold text-sm block mb-2">
            {t.licensePlate}
          </label>
          <input
            value={plateNumber}
            dir="ltr"
            onChange={(e) => onChangePlateNumber(e.target.value)}
            placeholder="e.g. 12-34567"
            className="w-full h-14 border border-vborder rounded-2xl px-4 font-heading font-bold text-xl text-center text-navy focus:outline-none focus:border-vblue transition-colors bg-white"
          />
        </div>
        <div>
          <label className="text-navy font-semibold text-sm block mb-2">
            {t.countryRegion}
          </label>
          <select
            value={plateCountry}
            onChange={(e) => onChangePlateCountry(e.target.value)}
            className="w-full h-12 border border-vborder rounded-xl px-4 text-navy text-sm focus:outline-none bg-white cursor-pointer"
          >
            <option value="JO">{t.jordan} (JO)</option>
            <option value="AE">{t.uae} (AE)</option>
            <option value="SA">{t.saudiArabia} (SA)</option>
            <option value="KW">{t.kuwait} (KW)</option>
            <option value="BH">{t.bahrain} (BH)</option>
            <option value="OTHER">{t.other}</option>
          </select>
        </div>
        <Btn label={t.continueLabel} onClick={onContinue} />
        <Btn
          label={t.noPlateUnreadable}
          variant="ghost"
          size="md"
          onClick={onNoPlate}
        />
      </div>
    </div>
  );
}

export function CheckInPlateConfirmStep({
  isManualEntry = false,
  plateNumber,
  plateCountry,
  temporaryDescriptor,
  make,
  model,
  color,
  isSubmitting,
  error,
  onConfirm,
  onEdit,
  onContinueWithoutRecognition,
  onBack,
}: {
  readonly color?: string | null | undefined;
  readonly error?: string | null | undefined;
  readonly isManualEntry?: boolean | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly make?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly onContinueWithoutRecognition?: (() => void) | undefined;
  readonly onEdit: () => void;
  readonly plateCountry?: string | undefined;
  readonly plateNumber?: string | undefined;
  readonly temporaryDescriptor?: string | null | undefined;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const displayPlate = temporaryDescriptor || plateNumber || t.noPlate;
  const displayCountry = plateCountry
    ? `${plateCountry} ${t.plateCountry}`
    : t.plate;
  const displayModel =
    make && model ? `${make} ${model}` : make || model || t.vehicle;

  let statusBadgeText = t.detected;
  if (temporaryDescriptor) {
    statusBadgeText = t.temporaryDescriptor;
  } else if (isManualEntry) {
    statusBadgeText = t.manualEntry;
  }

  return (
    <div>
      <BackHeader
        disabled={isSubmitting}
        title={t.confirmPlate}
        onBack={onBack}
      />
      <div className="p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}
        <div className="bg-ice rounded-2xl p-6 text-center">
          <p className="text-neutral text-xs font-semibold uppercase tracking-wider mb-2">
            {statusBadgeText}
          </p>
          <p className="font-heading font-bold text-[36px] text-navy tracking-widest break-all">
            <bdi dir="ltr">{displayPlate}</bdi>
          </p>
          {!temporaryDescriptor && !isManualEntry && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-vsuccess" />
              <span className="text-vsuccess text-xs font-semibold">
                {t.highConfidence} · {displayCountry}
              </span>
            </div>
          )}
          {!temporaryDescriptor && isManualEntry && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <span className="text-neutral text-xs font-semibold">
                {t.enteredPlate} · {displayCountry}
              </span>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-vborder p-4 space-y-1">
          <p className="text-muted text-xs uppercase tracking-wider mb-3">
            {t.vehicleDetails}
          </p>
          <VehicleIdentity
            color={color ?? t.notSpecified}
            model={displayModel}
            plate={displayPlate}
          />
        </div>
        <Btn
          label={isSubmitting ? t.confirmingPlate : t.confirmPlate}
          onClick={onConfirm}
          disabled={isSubmitting ?? false}
        />
        {error && onContinueWithoutRecognition && (
          <Btn
            label={t.continueWithoutRecognition}
            variant="secondary"
            size="md"
            onClick={onContinueWithoutRecognition}
            disabled={isSubmitting ?? false}
          />
        )}
        <Btn
          label={t.edit}
          variant="secondary"
          size="md"
          onClick={onEdit}
          disabled={isSubmitting ?? false}
        />
      </div>
    </div>
  );
}
