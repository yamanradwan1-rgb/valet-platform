"use client";

import { useState, type JSX } from "react";
import type { Screen } from "../../types/employee-ui";
import {
  useCheckIn,
  type StartParkingPayload,
} from "../../features/check-in";
import {
  CheckInCustomerPhoneStep,
  CheckInVehicleConditionStep,
} from "./check-in/check-in-intake-steps";
import {
  CheckInKeyAssignedStep,
  CheckInKeyScanStep,
  CheckInParkingTaskStep,
} from "./check-in/check-in-key-steps";
import {
  CheckInManualPlateStep,
  CheckInPlateConfirmStep,
  CheckInPlateScanStep,
} from "./check-in/check-in-plate-steps";
import { BackHeader, Btn } from "../ui/employee-primitives";

export interface CheckInFlowProps {
  readonly locationId?: string | null | undefined;
  readonly nav: (s: Screen) => void;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onStartParkingSuccess?: (payload: StartParkingPayload) => void;
}

export function CheckInFlow({
  nav,
  locationId = null,
  onAuthorizationLoss,
  onStartParkingSuccess,
}: CheckInFlowProps): JSX.Element | null {
  const checkIn = useCheckIn({ locationId, onAuthorizationLoss });

  const [scanDone, setScanDone] = useState(false);
  const [keyScanDone, setKeyScanDone] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [plateCountry, setPlateCountry] = useState("JO");
  const [temporaryDescriptor, setTemporaryDescriptor] = useState<string | null>(null);
  const [condition, setCondition] = useState("No visible issue");
  const [phone, setPhone] = useState("");
  const [keySlotCode, setKeySlotCode] = useState("");

  const activeVehicle = checkIn.activeSession?.vehicle ?? checkIn.pendingVehicle;
  const displayPlate =
    activeVehicle?.temporaryDescriptor ??
    activeVehicle?.plateNumberRaw ??
    temporaryDescriptor ??
    plateNumber;
  const displayMake = activeVehicle?.make ?? null;
  const displayModel = activeVehicle?.model ?? null;
  const displayColor = activeVehicle?.color ?? null;
  const displayKeySlot = checkIn.activeSession?.keySlotCode ?? keySlotCode;

  if (checkIn.isHydrating && checkIn.step === "discovery") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 space-y-4">
        <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
        <p className="text-navy font-semibold text-sm">Checking for existing check-in drafts...</p>
      </div>
    );
  }

  if (checkIn.step === "discovery-error" || checkIn.step === "hydration-error") {
    return (
      <div>
        <BackHeader title="Check-In Discovery" onBack={() => nav("task-queue")} />
        <div className="p-5 space-y-4">
          <div className="p-4 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-sm">
            <p className="font-bold">Failed to load check-in session</p>
            <p className="text-xs mt-1">{checkIn.error ?? "An unexpected network or server error occurred."}</p>
          </div>
          <Btn label="Retry Discovery" onClick={() => void checkIn.retry()} />
          <Btn label="Back to Task Queue" variant="secondary" onClick={() => nav("task-queue")} />
        </div>
      </div>
    );
  }

  if (checkIn.step === "multiple-recoverable") {
    return (
      <div>
        <BackHeader title="Recoverable Sessions" onBack={() => nav("task-queue")} />
        <div className="p-5 space-y-4">
          <p className="text-neutral text-xs font-semibold uppercase tracking-wider">Multiple Incomplete Check-Ins Found</p>
          {checkIn.drafts.map((draft) => (
            <div
              key={draft.sessionId}
              onClick={() => void checkIn.resumeDraft(draft)}
              className="bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm"
            >
              <span className="text-[10px] font-bold uppercase text-vblue bg-ice px-2 py-0.5 rounded">Draft</span>
              <p className="font-heading font-bold text-navy text-base mt-2">{draft.vehicle.make ?? "Vehicle"} {draft.vehicle.model ?? ""}</p>
              <p className="text-neutral text-xs">{draft.vehicle.plateNumberRaw ?? draft.vehicle.temporaryDescriptor ?? "No Plate"}</p>
            </div>
          ))}
          {checkIn.continuations.map((cont) => (
            <div
              key={cont.sessionId}
              onClick={() => void checkIn.resumeContinuation(cont)}
              className="bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm"
            >
              <span className="text-[10px] font-bold uppercase text-vsuccess bg-green-50 px-2 py-0.5 rounded">Awaiting Parking</span>
              <p className="font-heading font-bold text-navy text-base mt-2">{cont.vehicle.make ?? "Vehicle"} {cont.vehicle.model ?? ""}</p>
              <p className="text-neutral text-xs">{cont.vehicle.plateNumberRaw ?? cont.vehicle.temporaryDescriptor ?? "No Plate"}</p>
            </div>
          ))}
          <Btn label="Back to Task Queue" variant="secondary" onClick={() => nav("task-queue")} />
        </div>
      </div>
    );
  }

  if (checkIn.step === "plate-scan") {
    return (
      <CheckInPlateScanStep
        scanDone={scanDone}
        onSimulateScan={() => {
          setScanDone(true);
          setTemporaryDescriptor(null);
          setPlateNumber("12-34567");
          setTimeout(() => {
            setScanDone(false);
            checkIn.setStep("plate-confirm");
          }, 400);
        }}
        onManualEntry={() => checkIn.setStep("manual-plate")}
        onBack={() => nav("task-queue")}
      />
    );
  }

  if (checkIn.step === "manual-plate") {
    return (
      <CheckInManualPlateStep
        plateNumber={plateNumber}
        plateCountry={plateCountry}
        onChangePlateNumber={setPlateNumber}
        onChangePlateCountry={setPlateCountry}
        onNoPlate={() => {
          setTemporaryDescriptor("UNPLATED-VEHICLE");
          setPlateNumber("");
          checkIn.setStep("plate-confirm");
        }}
        onContinue={() => {
          setTemporaryDescriptor(null);
          checkIn.setStep("plate-confirm");
        }}
        onBack={() => checkIn.setStep("plate-scan")}
      />
    );
  }

  if (checkIn.step === "plate-confirm") {
    return (
      <CheckInPlateConfirmStep
        plateNumber={plateNumber}
        plateCountry={plateCountry}
        temporaryDescriptor={temporaryDescriptor}
        make={displayMake}
        model={displayModel}
        color={displayColor}
        isSubmitting={checkIn.isSubmitting}
        error={checkIn.error}
        onConfirm={async () => {
          await checkIn.confirmPlate({
            color: displayColor,
            make: displayMake,
            model: displayModel,
            plateCountry,
            plateNumberRaw: temporaryDescriptor ? "" : plateNumber,
            temporaryDescriptor,
          });
        }}
        onEdit={() => checkIn.setStep("manual-plate")}
        onBack={() => checkIn.setStep("plate-scan")}
      />
    );
  }

  if (checkIn.step === "customer-phone") {
    return (
      <CheckInCustomerPhoneStep
        phone={phone}
        make={displayMake}
        model={displayModel}
        color={displayColor}
        plate={displayPlate}
        isSubmitting={checkIn.isSubmitting}
        error={checkIn.error}
        onChangePhone={setPhone}
        onContinue={async () => {
          await checkIn.submitCustomerPhone(phone);
        }}
        onNoPhone={async () => {
          await checkIn.submitCustomerPhone("");
        }}
        onBack={() => checkIn.setStep("plate-confirm")}
      />
    );
  }

  if (checkIn.step === "vehicle-condition") {
    return (
      <CheckInVehicleConditionStep
        condition={condition}
        make={displayMake}
        model={displayModel}
        color={displayColor}
        plate={displayPlate}
        isSubmitting={checkIn.isSubmitting}
        error={checkIn.error}
        onSelectCondition={setCondition}
        onContinue={async () => {
          await checkIn.completeCondition(condition);
        }}
        onBack={() => checkIn.setStep(checkIn.activeSession?.state === "CHECKING_IN" ? "plate-confirm" : "customer-phone")}
      />
    );
  }

  if (checkIn.step === "key-scan") {
    return (
      <CheckInKeyScanStep
        keyScanDone={keyScanDone}
        keySlotCode={keySlotCode}
        make={displayMake}
        model={displayModel}
        color={displayColor}
        plate={displayPlate}
        isSubmitting={checkIn.isSubmitting}
        error={checkIn.error}
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
        onBack={() => checkIn.setStep("vehicle-condition")}
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
        error={checkIn.error}
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
        error={checkIn.error}
        onStartParking={async () => {
          const payload = await checkIn.startParking();
          if (payload) {
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
