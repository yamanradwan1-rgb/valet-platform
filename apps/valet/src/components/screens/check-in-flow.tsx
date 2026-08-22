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
import { CheckInRecoverableStep } from "./check-in/check-in-recoverable-step";
import { BackHeader, Btn } from "../ui/employee-primitives";

export interface CheckInFlowProps {
  readonly locationId?: string | null | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav: (s: Screen) => void;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onStartParkingSuccess?: (payload: StartParkingPayload) => void;
}

export function CheckInFlow({
  nav,
  locationId = null,
  mode = "live",
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
  const [isManualEntry, setIsManualEntry] = useState(false);

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
      <CheckInRecoverableStep
        drafts={checkIn.drafts}
        continuations={checkIn.continuations}
        onResumeDraft={(d) => void checkIn.resumeDraft(d)}
        onResumeContinuation={(c) => void checkIn.resumeContinuation(c)}
        onBack={() => nav("task-queue")}
      />
    );
  }

  if (checkIn.step === "plate-scan") {
    return (
      <CheckInPlateScanStep
        mode={mode}
        scanDone={scanDone}
        onSimulateScan={() => {
          setScanDone(true);
          setIsManualEntry(false);
          setTemporaryDescriptor(null);
          setPlateNumber("12-34567");
          setTimeout(() => {
            setScanDone(false);
            checkIn.setStep("plate-confirm");
          }, 400);
        }}
        onManualEntry={() => {
          setIsManualEntry(true);
          checkIn.setStep("manual-plate");
        }}
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
        isManualEntry={isManualEntry}
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
        onBack={() => {
          if (checkIn.activeSession?.state === "AWAITING_PARKING") {
            nav("task-queue");
          } else if (checkIn.activeSession?.state === "CHECKING_IN") {
            checkIn.setStep("plate-confirm");
          } else {
            checkIn.setStep("customer-phone");
          }
        }}
      />
    );
  }

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
