import { useEffect, useRef, useState } from "react";
import { ScrollView } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  EmployeeLocale,
  NativeAuthSession,
} from "@valet/employee-client";
import { emptyCheckInContinuation } from "@valet/employee-client";

import { getNativeCheckInCopy } from "./native-check-in-copy";
import { getNativeCheckInConditionCopy } from "./native-check-in-condition-copy";
import { getNativeCheckInContinuationCopy } from "./native-check-in-continuation-copy";
import {
  NativeCheckInContinuationStep,
  type ContinuationStepProps,
} from "./native-check-in-continuation-step";
import { NativeConfirmStep } from "./native-check-in-confirm-step";
import { NativeVehicleDetailsStep } from "./native-check-in-vehicle-details-step";
import { NativeCustomerStep } from "./native-check-in-input-steps";
import { NativeReturningStep } from "./native-check-in-returning-step";
import { NativeCaptureStep } from "./native-check-in-capture-step";
import {
  checkInBackBlocked,
  checkInHeaderTitle,
  initialCheckInCapturePresentation,
} from "./native-check-in-presentation";
import {
  CheckInHeader,
  type NativeTextAlign,
} from "./native-check-in-primitives";
import {
  NativeAmbiguousStep,
  NativeBusyStep,
  NativeCompleteStep,
  NativeDiscoveryErrorStep,
  NativeLoadingStep,
  NativeRecoverablesStep,
} from "./native-check-in-state-steps";
import { checkInStyles as s } from "./native-check-in-styles";

interface NativeCheckInWorkflowProps {
  readonly auth: NativeAuthSession;
  readonly locale: EmployeeLocale;
  readonly onClose: () => void;
  readonly onOpenParking?:
    ((sessionId: string) => Promise<boolean>) | undefined;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
}

export function NativeCheckInWorkflow({
  auth,
  locale,
  onClose,
  onOpenParking,
  session,
  snapshot,
}: NativeCheckInWorkflowProps) {
  const copy = getNativeCheckInCopy(locale);
  const conditionCopy = getNativeCheckInConditionCopy(locale);
  const continuationCopy = getNativeCheckInContinuationCopy(locale);
  const resolvedSnapshot: EmployeeCheckInSnapshot = snapshot.continuation
    ? snapshot
    : {
        ...snapshot,
        continuation: {
          ...emptyCheckInContinuation(),
          conditionSelection:
            snapshot.phase === "created" ? "No visible issue" : null,
          mode: snapshot.phase === "created" ? "select-condition" : "view",
        },
      };
  const textAlign: NativeTextAlign = locale === "ar" ? "right" : "left";
  const [capturePresentation, setCapturePresentation] = useState(() =>
    initialCheckInCapturePresentation(snapshot),
  );
  const previousPhase = useRef(snapshot.phase);
  const [parkingStarting, setParkingStarting] = useState(false);
  const [parkingStartError, setParkingStartError] = useState(false);
  useEffect(() => {
    if (snapshot.phase === "capture" && previousPhase.current !== "capture") {
      setCapturePresentation(initialCheckInCapturePresentation(snapshot));
    }
    previousPhase.current = snapshot.phase;
  }, [snapshot]);
  const back = () => {
    if (
      resolvedSnapshot.phase === "created" &&
      resolvedSnapshot.continuation.mode !== "view"
    ) {
      session.cancelVehicleEdit();
      return;
    }
    if (
      resolvedSnapshot.phase === "capture" &&
      capturePresentation !== "camera"
    ) {
      if (capturePresentation === "descriptor") {
        session.setVehicle({ mode: "CONFIRMED_PLATE" });
        setCapturePresentation("manual");
      } else {
        setCapturePresentation("camera");
      }
      return;
    }
    if (resolvedSnapshot.phase === "confirm") {
      setCapturePresentation(
        initialCheckInCapturePresentation(resolvedSnapshot),
      );
      session.editIdentity();
      return;
    }
    onClose();
  };
  const startParking = () => {
    const sessionId = resolvedSnapshot.active?.sessionId;
    if (
      sessionId === undefined ||
      onOpenParking === undefined ||
      parkingStarting
    )
      return;
    setParkingStartError(false);
    setParkingStarting(true);
    void onOpenParking(sessionId)
      .then((opened) => {
        if (!opened) {
          setParkingStarting(false);
          setParkingStartError(true);
        }
      })
      .catch(() => {
        setParkingStarting(false);
        setParkingStartError(true);
      });
  };
  const props = {
    auth,
    conditionCopy,
    continuationCopy,
    copy,
    locale,
    onClose,
    onStartParking: startParking,
    parkingStartError,
    parkingStarting,
    onPresentationChange: setCapturePresentation,
    presentation: capturePresentation,
    session,
    snapshot: resolvedSnapshot,
    textAlign,
  };
  if (resolvedSnapshot.phase === "discovering") {
    return <NativeLoadingStep {...props} />;
  }
  return (
    <>
      <CheckInHeader
        back={copy.back}
        disabled={
          checkInBackBlocked(
            resolvedSnapshot.phase,
            resolvedSnapshot.continuation.mode,
          ) || parkingStarting
        }
        onBack={back}
        textAlign={textAlign}
        title={checkInHeaderTitle(
          copy,
          resolvedSnapshot,
          capturePresentation,
          continuationCopy.title,
          conditionCopy.title,
        )}
        direction={locale === "ar" ? "rtl" : "ltr"}
      />
      <ScrollView
        contentContainerStyle={[
          s.body,
          { direction: locale === "ar" ? "rtl" : "ltr" },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {renderStep(resolvedSnapshot.phase, props)}
      </ScrollView>
    </>
  );
}

function renderStep(
  phase: EmployeeCheckInSnapshot["phase"],
  props: Parameters<typeof NativeCaptureStep>[0] &
    ContinuationStepProps & {
      readonly onClose: () => void;
    },
) {
  switch (phase) {
    case "discovering":
      return <NativeLoadingStep {...props} />;
    case "discovery-error":
      return <NativeDiscoveryErrorStep {...props} />;
    case "recoverables":
      return <NativeRecoverablesStep {...props} />;
    case "capture":
      return <NativeCaptureStep {...props} />;
    case "confirm":
      return <NativeConfirmStep {...props} />;
    case "recognizing":
    case "submitting":
      return <NativeBusyStep {...props} />;
    case "returning":
      return <NativeReturningStep {...props} />;
    case "vehicle-details":
      return <NativeVehicleDetailsStep {...props} />;
    case "customer":
      return <NativeCustomerStep {...props} />;
    case "intake-ambiguous":
      return <NativeAmbiguousStep {...props} />;
    case "created":
      return <NativeCheckInContinuationStep {...props} />;
    case "continuation":
      return <NativeCompleteStep {...props} />;
    case "inactive":
      return null;
  }
}
