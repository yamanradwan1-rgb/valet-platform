import { Text, View } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  CheckInStatus,
  type NativeTextAlign,
  RecoverableCard,
  VehicleCard,
} from "./native-check-in-primitives";
import { checkInStyles as s } from "./native-check-in-styles";
import { EmployeeProgress } from "../employee-ui/employee-feedback";

interface StateStepProps {
  readonly copy: NativeCheckInCopy;
  readonly onClose: () => void;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

export function NativeLoadingStep({ copy, textAlign }: StateStepProps) {
  return <EmployeeProgress textAlign={textAlign} label={copy.loading} />;
}

export function NativeDiscoveryErrorStep({
  copy,
  session,
  textAlign,
}: StateStepProps) {
  return (
    <>
      <CheckInError textAlign={textAlign}>{copy.discoveryError}</CheckInError>
      <CheckInButton
        label={copy.retry}
        onPress={() => void session.retryDiscovery()}
      />
    </>
  );
}

export function NativeRecoverablesStep({
  copy,
  session,
  snapshot,
  textAlign,
}: StateStepProps) {
  return (
    <>
      <Text accessibilityRole="header" style={[s.title, { textAlign }]}>
        {copy.multiple}
      </Text>
      {snapshot.recoverables.map((recoverable) => (
        <RecoverableCard
          key={`${recoverable.kind}-${recoverable.value.sessionId}`}
          label={
            recoverable.kind === "DRAFT"
              ? copy.recoverableDraft
              : copy.recoverableContinuation
          }
          onPress={() => void session.resume(recoverable)}
          recoverable={recoverable}
          textAlign={textAlign}
          vehicleFallback={copy.vehicle}
        />
      ))}
    </>
  );
}

export function NativeBusyStep({ copy, snapshot, textAlign }: StateStepProps) {
  return (
    <CheckInStatus textAlign={textAlign}>
      {snapshot.phase === "recognizing" ? copy.recognizing : copy.submitting}
    </CheckInStatus>
  );
}

export function NativeAmbiguousStep({
  copy,
  session,
  snapshot,
  textAlign,
}: StateStepProps) {
  return (
    <>
      <CheckInError textAlign={textAlign}>{copy.intakeUnknown}</CheckInError>
      <CheckInButton
        disabled={!snapshot.recoveryChecked && snapshot.error === null}
        label={copy.checkServer}
        onPress={() => void session.recoverAmbiguous()}
      />
      {snapshot.recoveryChecked ? (
        <CheckInButton
          label={copy.retrySame}
          onPress={() => void session.retryIntake()}
          secondary
        />
      ) : null}
    </>
  );
}

export function NativeCompleteStep({
  copy,
  onClose,
  snapshot,
  textAlign,
}: StateStepProps) {
  const continuation = snapshot.phase === "continuation";
  const title = continuation ? copy.awaitingParkingTitle : copy.createdTitle;
  const body = continuation ? copy.awaitingParkingBody : copy.createdBody;
  return (
    <>
      <View accessibilityLabel={title} style={s.successCircle}>
        <Text style={s.successMark}>✓</Text>
      </View>
      <Text accessibilityRole="header" style={[s.title, { textAlign }]}>
        {title}
      </Text>
      {snapshot.active ? (
        <VehicleCard
          fallback={copy.vehicle}
          textAlign={textAlign}
          vehicle={snapshot.active.vehicle}
        />
      ) : null}
      <CheckInStatus textAlign={textAlign}>{body}</CheckInStatus>
      <CheckInButton label={copy.close} onPress={onClose} />
    </>
  );
}
