import { useState, type JSX } from "react";

import type { CheckInStep, Screen } from "../../types/employee-ui";
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

export function CheckInFlow({
  nav,
}: {
  nav: (s: Screen) => void;
}): JSX.Element | null {
  const [step, setStep] = useState<CheckInStep>("plate-scan");
  const [scanDone, setScanDone] = useState(false);
  const [keyScanDone, setKeyScanDone] = useState(false);
  const [condition, setCondition] = useState("");
  const [phone, setPhone] = useState("");

  const go = (s: CheckInStep) => setStep(s);

  if (step === "plate-scan") {
    return (
      <CheckInPlateScanStep
        scanDone={scanDone}
        onSimulateScan={() => {
          setScanDone(true);
          setTimeout(() => go("plate-confirm"), 600);
        }}
        onManualEntry={() => go("manual-plate")}
        onBack={() => nav("task-queue")}
      />
    );
  }

  if (step === "manual-plate") {
    return (
      <CheckInManualPlateStep
        onContinue={() => go("plate-confirm")}
        onBack={() => go("plate-scan")}
      />
    );
  }

  if (step === "plate-confirm") {
    return (
      <CheckInPlateConfirmStep
        onConfirm={() => go("customer-phone")}
        onEdit={() => go("manual-plate")}
        onBack={() => go("plate-scan")}
      />
    );
  }

  if (step === "customer-phone") {
    return (
      <CheckInCustomerPhoneStep
        phone={phone}
        onChangePhone={setPhone}
        onContinue={() => go("vehicle-condition")}
        onBack={() => go("plate-confirm")}
      />
    );
  }

  if (step === "vehicle-condition") {
    return (
      <CheckInVehicleConditionStep
        condition={condition}
        onSelectCondition={setCondition}
        onContinue={() => go("key-scan")}
        onBack={() => go("customer-phone")}
      />
    );
  }

  if (step === "key-scan") {
    return (
      <CheckInKeyScanStep
        keyScanDone={keyScanDone}
        onSimulateScan={() => setKeyScanDone(true)}
        onManualEntry={() => setKeyScanDone(true)}
        onAssignKey={() => go("key-assigned")}
        onScanAnother={() => setKeyScanDone(false)}
        onBack={() => go("vehicle-condition")}
      />
    );
  }

  if (step === "key-assigned") {
    return (
      <CheckInKeyAssignedStep onCreateParkingTask={() => go("parking-task")} />
    );
  }

  if (step === "parking-task") {
    return (
      <CheckInParkingTaskStep
        onStartParking={() => nav("parking")}
        onBack={() => go("key-assigned")}
      />
    );
  }

  return null;
}
