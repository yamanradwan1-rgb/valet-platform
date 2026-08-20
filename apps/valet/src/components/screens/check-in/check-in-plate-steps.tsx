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
  scanDone: boolean;
  onSimulateScan: () => void;
  onManualEntry: () => void;
  onBack: () => void;
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
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
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
            defaultValue="12-34567"
            className="w-full h-14 border border-vborder rounded-2xl px-4 font-heading font-bold text-xl text-center text-navy focus:outline-none focus:border-vblue transition-colors bg-white"
          />
        </div>
        <div>
          <label className="text-navy font-semibold text-sm block mb-2">
            Country / Region
          </label>
          <select className="w-full h-12 border border-vborder rounded-xl px-4 text-navy text-sm focus:outline-none bg-white cursor-pointer">
            <option>Jordan (JO)</option>
            <option>UAE (AE)</option>
            <option>Saudi Arabia (SA)</option>
            <option>Kuwait (KW)</option>
            <option>Bahrain (BH)</option>
            <option>Other</option>
          </select>
        </div>
        <Btn label="Continue" onClick={onContinue} />
        <Btn label="No plate / unreadable plate" variant="ghost" size="md" />
      </div>
    </div>
  );
}

export function CheckInPlateConfirmStep({
  onConfirm,
  onEdit,
  onBack,
}: {
  onConfirm: () => void;
  onEdit: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Confirm Plate" onBack={onBack} />
      <div className="p-5 space-y-5">
        <div className="bg-ice rounded-2xl p-6 text-center">
          <p className="text-neutral text-xs font-semibold uppercase tracking-wider mb-2">
            Detected
          </p>
          <p className="font-heading font-bold text-[42px] text-navy tracking-widest">
            12-34567
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-vsuccess" />
            <span className="text-vsuccess text-xs font-semibold">
              High confidence · Jordan plate
            </span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-vborder p-4 space-y-1">
          <p className="text-muted text-xs uppercase tracking-wider mb-3">
            Vehicle detected
          </p>
          <VehicleIdentity color="Black" />
        </div>
        <Btn label="Confirm Plate" onClick={onConfirm} />
        <Btn label="Edit" variant="secondary" size="md" onClick={onEdit} />
      </div>
    </div>
  );
}
