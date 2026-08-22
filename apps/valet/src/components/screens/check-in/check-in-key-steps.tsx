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

export function CheckInKeyScanStep({
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
  readonly model?: string | null | undefined;
  readonly onAssignKey: () => void;
  readonly onBack: () => void;
  readonly onChangeKeySlotCode: (code: string) => void;
  readonly onManualEntry: () => void;
  readonly onScanAnother: () => void;
  readonly onSimulateScan: () => void;
  readonly plate?: string | null | undefined;
}): JSX.Element {
  const displayModel = make && model ? `${make} ${model}` : (make || model || "Vehicle");

  return (
    <div>
      <BackHeader title="Assign Key" onBack={onBack} />
      {error && (
        <div className="mx-5 mt-3 p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
          {error}
        </div>
      )}
      {!keyScanDone ? (
        <>
          <ScannerFrame
            label="Scan key slot QR"
            sublabel="Position the QR within the frame"
          />
          <div className="p-5 space-y-3">
            <Btn label="Simulate Key QR Scan" onClick={onSimulateScan} />
            <Btn
              label="Enter key slot manually"
              variant="secondary"
              onClick={onManualEntry}
            />
          </div>
        </>
      ) : (
        <div className="p-5 space-y-5">
          <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 text-center">
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              Key Slot
            </p>
            <input
              value={keySlotCode}
              onChange={(e) => onChangeKeySlotCode(e.target.value)}
              placeholder="Enter slot"
              className="w-full text-center font-heading font-bold text-[40px] text-navy bg-transparent focus:outline-none"
            />
          </div>
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity
              color={color ?? "Not specified"}
              model={displayModel}
              plate={plate ?? "No plate"}
            />
          </div>
          <Btn
            label={isSubmitting ? "Assigning Key..." : "Assign Key"}
            onClick={onAssignKey}
            variant="success"
            disabled={Boolean(isSubmitting) || keySlotCode.trim() === ""}
          />
          <Btn
            label="Scan another key"
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
  const displayModel = make && model ? `${make} ${model}` : (make || model || "Vehicle");

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <SuccessCircle />
      <div className="text-center">
        <p className="font-heading font-bold text-2xl text-navy">
          Key {keySlotCode} assigned
        </p>
        <p className="text-neutral text-sm mt-1">
          Successfully linked to this vehicle
        </p>
      </div>
      {error && (
        <div className="w-full p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs text-center">
          {error}
        </div>
      )}
      <div className="w-full bg-white rounded-2xl border border-vborder p-5">
        <VehicleIdentity
          color={color ?? "Not specified"}
          model={displayModel}
          plate={plate ?? "No plate"}
        />
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-vborder">
          <span className="text-neutral text-sm">Key slot</span>
          <span className="bg-navy-3 text-white font-heading font-bold text-sm px-3 py-1.5 rounded-lg">
            {keySlotCode}
          </span>
        </div>
      </div>
      <div className="w-full">
        <Btn
          label={isSubmitting ? "Creating Task..." : "Create Parking Task"}
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
  readonly onStartParking: () => void;
  readonly plate?: string | null | undefined;
}): JSX.Element {
  const displayModel = make && model ? `${make} ${model}` : (make || model || "Vehicle");

  return (
    <div>
      <BackHeader title="Parking Task" onBack={onBack} />
      <div className="p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}
        <Badge variant="parking" />
        <VehicleIdentity
          color={color ?? "Not specified"}
          model={displayModel}
          plate={plate ?? "No plate"}
        />
        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Key slot" value={keySlotCode || "Not assigned"} />
        </div>
        <div className="bg-ice rounded-xl px-4 py-3 flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-vblue flex-shrink-0 mt-px" />
          <p className="text-vblue text-xs font-semibold">
            Location tracking will activate for this parking task
          </p>
        </div>
        <Btn
          label={isSubmitting ? "Starting Parking..." : "Start Parking"}
          onClick={onStartParking}
          disabled={isSubmitting ?? false}
        />
      </div>
    </div>
  );
}
