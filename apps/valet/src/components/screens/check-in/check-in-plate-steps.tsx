import type { JSX } from "react";

import {
  BackHeader,
  Btn,
  ScannerFrame,
  VehicleIdentity,
} from "../../ui/employee-primitives";

export function CheckInPlateScanStep({
  scanDone,
  onSimulateScan,
  onManualEntry,
  onBack,
}: {
  readonly onBack: () => void;
  readonly onManualEntry: () => void;
  readonly onSimulateScan: () => void;
  readonly scanDone: boolean;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Scan Plate" onBack={onBack} />
      <ScannerFrame
        label="Scan license plate"
        sublabel="Position the plate within the frame"
        scanned={scanDone}
      />
      <div className="p-5 space-y-3">
        {!scanDone ? (
          <>
            <Btn label="Simulate Plate Detection" onClick={onSimulateScan} />
            <Btn
              label="Enter manually"
              variant="secondary"
              onClick={onManualEntry}
            />
          </>
        ) : (
          <div className="text-center py-3">
            <p className="text-vsuccess font-semibold text-sm">
              Plate detected — confirming...
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
  return (
    <div>
      <BackHeader title="Enter Plate" onBack={onBack} />
      <div className="p-5 space-y-5">
        <div>
          <label className="text-navy font-semibold text-sm block mb-2">
            License Plate
          </label>
          <input
            value={plateNumber}
            onChange={(e) => onChangePlateNumber(e.target.value)}
            placeholder="12-34567"
            className="w-full h-14 border border-vborder rounded-2xl px-4 font-heading font-bold text-xl text-center text-navy focus:outline-none focus:border-vblue transition-colors bg-white"
          />
        </div>
        <div>
          <label className="text-navy font-semibold text-sm block mb-2">
            Country / Region
          </label>
          <select
            value={plateCountry}
            onChange={(e) => onChangePlateCountry(e.target.value)}
            className="w-full h-12 border border-vborder rounded-xl px-4 text-navy text-sm focus:outline-none bg-white cursor-pointer"
          >
            <option value="JO">Jordan (JO)</option>
            <option value="AE">UAE (AE)</option>
            <option value="SA">Saudi Arabia (SA)</option>
            <option value="KW">Kuwait (KW)</option>
            <option value="BH">Bahrain (BH)</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <Btn label="Continue" onClick={onContinue} />
        <Btn
          label="No plate / unreadable plate"
          variant="ghost"
          size="md"
          onClick={onNoPlate}
        />
      </div>
    </div>
  );
}

export function CheckInPlateConfirmStep({
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
  onBack,
}: {
  readonly color?: string | null | undefined;
  readonly error?: string | null | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly make?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly onEdit: () => void;
  readonly plateCountry?: string | undefined;
  readonly plateNumber?: string | undefined;
  readonly temporaryDescriptor?: string | null | undefined;
}): JSX.Element {
  const displayPlate = temporaryDescriptor || plateNumber || "12-34567";
  const displayCountry = plateCountry ? `${plateCountry} plate` : "Jordan plate";

  return (
    <div>
      <BackHeader title="Confirm Plate" onBack={onBack} />
      <div className="p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}
        <div className="bg-ice rounded-2xl p-6 text-center">
          <p className="text-neutral text-xs font-semibold uppercase tracking-wider mb-2">
            {temporaryDescriptor ? "Temporary Descriptor" : "Detected"}
          </p>
          <p className="font-heading font-bold text-[36px] text-navy tracking-widest break-all">
            {displayPlate}
          </p>
          {!temporaryDescriptor && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-vsuccess" />
              <span className="text-vsuccess text-xs font-semibold">
                High confidence · {displayCountry}
              </span>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-vborder p-4 space-y-1">
          <p className="text-muted text-xs uppercase tracking-wider mb-3">
            Vehicle detected
          </p>
          <VehicleIdentity
            color={color ?? "Black"}
            model={make && model ? `${make} ${model}` : (model ?? "BMW X5")}
            plate={displayPlate}
          />
        </div>
        <Btn
          label={isSubmitting ? "Registering Vehicle..." : "Confirm Plate"}
          onClick={onConfirm}
          disabled={isSubmitting ?? false}
        />
        <Btn
          label="Edit"
          variant="secondary"
          size="md"
          onClick={onEdit}
          disabled={isSubmitting ?? false}
        />
      </div>
    </div>
  );
}
