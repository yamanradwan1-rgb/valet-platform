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
import {
  CheckInDiscoveryError,
  CheckInDiscoveryLoading,
} from "./check-in/check-in-discovery-state";
import { useEmployeeI18n } from "../shell/employee-i18n";
import { presentLiveError } from "../../lib/i18n/live-presentation";

export interface CheckInFlowProps {
  readonly locationId?: string | null | undefined;
  readonly membershipId?: string | null | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav: (s: Screen) => void;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onStartParkingSuccess?: (payload: StartParkingPayload) => void;
}

export function CheckInFlow({
  nav,
  locationId = null,
  membershipId = null,
  mode = "live",
  onAuthorizationLoss,
  onStartParkingSuccess,
}: CheckInFlowProps): JSX.Element | null {
  const { locale, t } = useEmployeeI18n();
  const checkIn = useCheckIn({ locationId, membershipId, onAuthorizationLoss });

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
  const localizedError = checkIn.error
    ? presentLiveError(new Error(checkIn.error), locale, t)
    : null;

  if (checkIn.isHydrating && checkIn.step === "discovery") {
    return <CheckInDiscoveryLoading />;
  }

  if (checkIn.step === "discovery-error" || checkIn.step === "hydration-error") {
    return (
      <CheckInDiscoveryError
        message={localizedError ?? t.unexpectedError}
        nav={nav}
        onRetry={() => void checkIn.retry()}
      />
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
        error={localizedError}
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
        error={localizedError}
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
        error={localizedError}
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
