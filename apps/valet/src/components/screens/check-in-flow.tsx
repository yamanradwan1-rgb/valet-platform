"use client";

import { useState, type JSX } from "react";
import type { Screen } from "../../types/employee-ui";
import { useCheckIn, type StartParkingPayload } from "../../features/check-in";
import {
  CheckInCustomerPhoneStep,
  CheckInVehicleConditionStep,
} from "./check-in/check-in-intake-steps";
import { CheckInLateSteps } from "./check-in/check-in-late-steps";
import {
  CheckInManualPlateStep,
  CheckInPlateConfirmStep,
  CheckInPlateScanStep,
} from "./check-in/check-in-plate-steps";
import { CheckInRecoverableStep } from "./check-in/check-in-recoverable-step";
import { CheckInReturningVehicleStep } from "./check-in/check-in-returning-vehicle-step";
import { CheckInVehicleDetailsStep } from "./check-in/check-in-vehicle-details-step";
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
  readonly onOpenGuestAccess?: ((sessionId: string) => void) | undefined;
  readonly onStartParkingSuccess?: (payload: StartParkingPayload) => void;
}

export function CheckInFlow({
  nav,
  locationId = null,
  membershipId = null,
  mode = "live",
  onAuthorizationLoss,
  onOpenGuestAccess,
  onStartParkingSuccess,
}: CheckInFlowProps): JSX.Element | null {
  const { locale, t } = useEmployeeI18n();
  const checkIn = useCheckIn({ locationId, membershipId, onAuthorizationLoss });

  const [scanDone, setScanDone] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [plateCountry, setPlateCountry] = useState("JO");
  const [temporaryDescriptor, setTemporaryDescriptor] = useState<string | null>(
    null,
  );
  const [condition, setCondition] = useState("No visible issue");
  const [phone, setPhone] = useState("");
  const [isManualEntry, setIsManualEntry] = useState(false);

  const confirmNoPlate = (): void => {
    setTemporaryDescriptor("");
    setPlateNumber("");
    void checkIn.confirmPlate({
      color: null,
      make: null,
      model: null,
      plateCountry,
      plateNumberRaw: "",
      temporaryDescriptor: "",
    });
  };

  const activeVehicle =
    checkIn.activeSession?.vehicle ?? checkIn.pendingVehicle;
  const displayPlate =
    activeVehicle?.temporaryDescriptor ??
    activeVehicle?.plateNumberRaw ??
    temporaryDescriptor ??
    plateNumber;
  const displayMake = activeVehicle?.make ?? null;
  const displayModel = activeVehicle?.model ?? null;
  const displayColor = activeVehicle?.color ?? null;
  const localizedError = checkIn.error
    ? presentLiveError(new Error(checkIn.error), locale, t, checkIn.errorCode)
    : null;

  if (checkIn.isHydrating && checkIn.step === "discovery") {
    return <CheckInDiscoveryLoading />;
  }

  if (
    checkIn.step === "discovery-error" ||
    checkIn.step === "hydration-error"
  ) {
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
        identityKey={`${membershipId ?? ""}:${locationId ?? ""}`}
        mode={mode}
        onCapturedContinue={() => {
          setIsManualEntry(true);
          setTemporaryDescriptor(null);
          checkIn.setStep("plate-confirm");
        }}
        onChangePlateCountry={setPlateCountry}
        onChangePlateNumber={setPlateNumber}
        onNoPlate={confirmNoPlate}
        plateCountry={plateCountry}
        plateNumber={plateNumber}
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
        onNoPlate={confirmNoPlate}
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
        onContinueWithoutRecognition={
          checkIn.recognitionFailed
            ? checkIn.continueWithoutRecognition
            : undefined
        }
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

  if (checkIn.step === "returning-vehicle" && checkIn.recognizedVehicle) {
    return (
      <CheckInReturningVehicleStep
        vehicle={checkIn.recognizedVehicle}
        correctionConflict={checkIn.correctionConflict}
        customerResolved={checkIn.customerResolved}
        isSubmitting={checkIn.isSubmitting}
        error={localizedError}
        onBack={() => checkIn.setStep("plate-confirm")}
        onContinue={() => void checkIn.continueAfterCustomerResolution()}
        onDifferentCustomer={() =>
          checkIn.continueToCustomer("returning-vehicle")
        }
        onSaveCorrection={checkIn.setPendingCorrection}
        onUseSavedCustomer={() => void checkIn.useSavedCustomer()}
      />
    );
  }

  if (checkIn.step === "vehicle-details" && checkIn.pendingVehicle) {
    const noPlate = checkIn.pendingVehicle.temporaryDescriptor !== null;
    return (
      <CheckInVehicleDetailsStep
        initialDetails={checkIn.pendingVehicle}
        initialTemporaryDescriptor={
          checkIn.pendingVehicle.temporaryDescriptor ?? ""
        }
        isNoPlate={noPlate}
        plate={noPlate ? t.noPlate : checkIn.pendingVehicle.plateNumberRaw}
        onBack={() => checkIn.setStep("plate-confirm")}
        onContinue={(details, descriptor) => {
          checkIn.setVehicleDetails(details, descriptor);
        }}
      />
    );
  }

  if (checkIn.step === "customer-phone") {
    return (
      <CheckInCustomerPhoneStep
        errorCode={checkIn.errorCode}
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
        onBack={() => checkIn.setStep(checkIn.customerOrigin)}
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

  return (
    <CheckInLateSteps
      checkIn={checkIn}
      displayColor={displayColor}
      displayMake={displayMake}
      displayModel={displayModel}
      displayPlate={displayPlate}
      localizedError={localizedError}
      nav={nav}
      onOpenGuestAccess={onOpenGuestAccess}
      onStartParkingSuccess={onStartParkingSuccess}
    />
  );
}
