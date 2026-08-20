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
  onSimulateScan,
  onManualEntry,
  onAssignKey,
  onScanAnother,
  onBack,
}: {
  keyScanDone: boolean;
  onSimulateScan: () => void;
  onManualEntry: () => void;
  onAssignKey: () => void;
  onScanAnother: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Assign Key" onBack={onBack} />
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
            <p className="font-heading font-bold text-[44px] text-navy">
              B-214
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-vsuccess" />
              <span className="text-vsuccess text-sm font-semibold">
                Available
              </span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-vborder p-4">
            <VehicleIdentity />
          </div>
          <Btn label="Assign Key" onClick={onAssignKey} variant="success" />
          <Btn
            label="Scan another key"
            variant="secondary"
            size="md"
            onClick={onScanAnother}
          />
        </div>
      )}
    </div>
  );
}

export function CheckInKeyAssignedStep({
  onCreateParkingTask,
}: {
  onCreateParkingTask: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <SuccessCircle />
      <div className="text-center">
        <p className="font-heading font-bold text-2xl text-navy">
          Key B-214 assigned
        </p>
        <p className="text-neutral text-sm mt-1">
          Successfully linked to this vehicle
        </p>
      </div>
      <div className="w-full bg-white rounded-2xl border border-vborder p-5">
        <VehicleIdentity color="Black" />
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-vborder">
          <span className="text-neutral text-sm">Key slot</span>
          <span className="bg-navy-3 text-white font-heading font-bold text-sm px-3 py-1.5 rounded-lg">
            B-214
          </span>
        </div>
      </div>
      <div className="w-full">
        <Btn label="Create Parking Task" onClick={onCreateParkingTask} />
      </div>
    </div>
  );
}

export function CheckInParkingTaskStep({
  onStartParking,
  onBack,
}: {
  onStartParking: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Parking Task" onBack={onBack} />
      <div className="p-5 space-y-5">
        <Badge variant="parking" />
        <VehicleIdentity color="Black" />
        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Key slot" value="B-214" />
          <InfoRow label="Destination" value="Zone B" />
          <InfoRow label="Pickup point" value="Main Entrance" />
        </div>
        <div className="bg-ice rounded-xl px-4 py-3 flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-vblue flex-shrink-0 mt-px" />
          <p className="text-vblue text-xs font-semibold">
            Location tracking will activate for this parking task
          </p>
        </div>
        <Btn label="Start Parking" onClick={onStartParking} />
      </div>
    </div>
  );
}
