import { ScrollView } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  EmployeeLocale,
} from "@valet/employee-client";

import { getNativeCheckInCopy } from "./native-check-in-copy";
import {
  NativeCaptureStep,
  NativeConfirmStep,
  NativeCustomerStep,
  NativeReturningStep,
} from "./native-check-in-input-steps";
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
  readonly locale: EmployeeLocale;
  readonly onClose: () => void;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
}

export function NativeCheckInWorkflow({
  locale,
  onClose,
  session,
  snapshot,
}: NativeCheckInWorkflowProps) {
  const copy = getNativeCheckInCopy(locale);
  const textAlign: NativeTextAlign = locale === "ar" ? "right" : "left";
  const props = { copy, onClose, session, snapshot, textAlign };
  return (
    <>
      <CheckInHeader
        back={copy.back}
        onBack={onClose}
        textAlign={textAlign}
        title={copy.title}
      />
      <ScrollView
        contentContainerStyle={[
          s.body,
          { direction: locale === "ar" ? "rtl" : "ltr" },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {renderStep(snapshot.phase, props)}
      </ScrollView>
    </>
  );
}

function renderStep(
  phase: EmployeeCheckInSnapshot["phase"],
  props: Parameters<typeof NativeCaptureStep>[0] & {
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
    case "customer":
      return <NativeCustomerStep {...props} />;
    case "intake-ambiguous":
      return <NativeAmbiguousStep {...props} />;
    case "created":
    case "continuation":
      return <NativeCompleteStep {...props} />;
    case "inactive":
      return null;
  }
}
