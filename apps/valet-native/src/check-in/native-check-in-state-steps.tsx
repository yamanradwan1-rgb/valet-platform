import { Text } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import { checkInTextStyle } from "./native-check-in-presentation";
import {
  CheckInButton,
  CheckInErrorNotice,
  DraftVehicleCard,
  type NativeTextAlign,
  RecoverableCard,
  VehicleCard,
} from "./native-check-in-primitives";
import { checkInStyles as s } from "./native-check-in-styles";
import { EmployeeProgress } from "../employee-ui/employee-feedback";
import { NativeCheckInIdentityContext } from "./native-check-in-identity-context";
import { NativeCheckInParkingTaskStep } from "./native-check-in-parking-task-step";

interface StateStepProps {
  readonly copy: NativeCheckInCopy;
  readonly onClose: () => void;
  readonly onStartParking?: (() => void) | undefined;
  readonly parkingStartError?: boolean | undefined;
  readonly parkingStarting?: boolean | undefined;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

export function NativeLoadingStep({ copy, textAlign }: StateStepProps) {
  return <EmployeeProgress textAlign={textAlign} label={copy.loading} />;
}

export function NativeDiscoveryErrorStep({
  copy,
  onClose,
  session,
  textAlign,
}: StateStepProps) {
  return (
    <>
      <CheckInErrorNotice
        textAlign={textAlign}
        title={copy.discoveryErrorTitle}
      >
        {copy.discoveryError}
      </CheckInErrorNotice>
      <CheckInButton
        label={copy.retryDiscovery}
        onPress={() => void session.retryDiscovery()}
      />
      <CheckInButton label={copy.close} onPress={onClose} variant="secondary" />
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
      <Text style={[s.eyebrow, checkInTextStyle("human", textAlign)]}>
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
  if (snapshot.phase === "recognizing") {
    return (
      <>
        <NativeCheckInIdentityContext
          copy={copy}
          presentation="camera"
          snapshot={snapshot}
          textAlign={textAlign}
        />
        <CheckInButton
          busy
          label={copy.recognizing}
          onPress={() => undefined}
        />
      </>
    );
  }
  const recognized = snapshot.recognizedVehicle;
  return (
    <>
      {recognized ? (
        <VehicleCard
          fallback={copy.vehicle}
          textAlign={textAlign}
          vehicle={recognized}
        />
      ) : (
        <DraftVehicleCard
          fallback={copy.vehicle}
          newVehicleLabel={copy.newVehicle}
          textAlign={textAlign}
          vehicle={snapshot.vehicle}
        />
      )}
      <CheckInButton busy label={copy.submitting} onPress={() => undefined} />
    </>
  );
}

export function NativeAmbiguousStep({
  copy,
  session,
  snapshot,
  textAlign,
}: StateStepProps) {
  const checking = !snapshot.recoveryChecked && snapshot.error === null;
  return (
    <>
      <CheckInErrorNotice textAlign={textAlign} title={copy.intakeUnknownTitle}>
        {copy.intakeUnknown}
      </CheckInErrorNotice>
      <CheckInButton
        busy={checking}
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
  onStartParking,
  parkingStartError = false,
  parkingStarting = false,
  snapshot,
  textAlign,
}: StateStepProps) {
  return (
    <NativeCheckInParkingTaskStep
      copy={copy}
      error={parkingStartError || snapshot.error !== null}
      onStart={onStartParking ?? (() => undefined)}
      snapshot={snapshot}
      starting={parkingStarting}
      textAlign={textAlign}
    />
  );
}
