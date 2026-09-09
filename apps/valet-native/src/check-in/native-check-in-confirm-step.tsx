import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import type { NativeCapturePresentation } from "./native-check-in-presentation";
import {
  CheckInButton,
  CheckInError,
  type NativeTextAlign,
} from "./native-check-in-primitives";
import { NativeCheckInIdentityContext } from "./native-check-in-identity-context";

export function NativeConfirmStep({
  copy,
  presentation,
  session,
  snapshot,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly presentation: NativeCapturePresentation;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}) {
  const hasPlate = snapshot.vehicle.mode === "CONFIRMED_PLATE";
  const confirmation = hasPlate ? copy.confirmPlate : copy.confirmDescription;
  return (
    <>
      {snapshot.error ? (
        <CheckInError textAlign={textAlign}>
          {copy.recognitionError}
        </CheckInError>
      ) : null}
      <NativeCheckInIdentityContext
        copy={copy}
        presentation={presentation}
        snapshot={snapshot}
        textAlign={textAlign}
      />
      <CheckInButton
        label={confirmation}
        onPress={() => void session.confirmIdentity()}
      />
      {snapshot.error ? (
        <CheckInButton
          label={copy.continueWithoutRecognition}
          onPress={() => session.continueWithoutRecognition()}
          variant="secondary"
        />
      ) : null}
      <CheckInButton
        label={copy.edit}
        onPress={() => session.editIdentity()}
        variant="secondary"
      />
    </>
  );
}
