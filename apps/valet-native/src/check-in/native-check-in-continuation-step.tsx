import { Text } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInContinuationCopy } from "./native-check-in-continuation-copy";
import {
  ContinuationDetailsEditor,
  ContinuationIdentityEditor,
} from "./native-check-in-continuation-editors";
import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInErrorNotice,
  CheckInStatus,
  type NativeTextAlign,
  VehicleCard,
} from "./native-check-in-primitives";
import { checkInTextStyle } from "./native-check-in-presentation";
import { checkInStyles as s } from "./native-check-in-styles";
import {
  EmployeeBadge,
  EmployeeCard,
  EmployeeProgress,
} from "../employee-ui/employee-feedback";

export interface ContinuationStepProps {
  readonly continuationCopy: NativeCheckInContinuationCopy;
  readonly copy: NativeCheckInCopy;
  readonly onClose: () => void;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

export function NativeCheckInContinuationStep(props: ContinuationStepProps) {
  const mode = props.snapshot.continuation.mode;
  if (mode === "submitting" || mode === "reconciling") {
    return (
      <EmployeeProgress
        label={
          mode === "submitting"
            ? props.continuationCopy.saving
            : props.continuationCopy.checkingState
        }
        textAlign={props.textAlign}
      />
    );
  }
  if (mode === "edit-details") return <ContinuationDetailsEditor {...props} />;
  if (mode === "edit-identity" || mode === "confirm-identity")
    return <ContinuationIdentityEditor {...props} />;
  if (mode === "boundary") return <ContinuationBoundary {...props} />;
  return <VehicleOverview {...props} />;
}

function VehicleOverview({
  continuationCopy: c,
  copy,
  session,
  snapshot,
  textAlign,
}: ContinuationStepProps) {
  const active = snapshot.active;
  if (active === null) return null;
  const mode = snapshot.continuation.mode;
  return (
    <>
      {mode === "ambiguous" ? (
        <CheckInErrorNotice
          textAlign={textAlign}
          title={c.correctionUnknownTitle}
        >
          {c.correctionUnknown}
        </CheckInErrorNotice>
      ) : mode === "conflict" ? (
        <CheckInErrorNotice textAlign={textAlign} title={c.conflictTitle}>
          {c.conflictBody}
        </CheckInErrorNotice>
      ) : null}
      <EmployeeBadge
        label={c.authoritative}
        textAlign={textAlign}
        variant="primary"
      />
      <VehicleCard
        fallback={copy.vehicle}
        textAlign={textAlign}
        vehicle={active.vehicle}
      />
      <VehicleDetailsCard {...{ active, c, textAlign }} />
      {snapshot.continuation.lastMutationKind ? (
        <CheckInStatus textAlign={textAlign}>
          {mutationMessage(c, snapshot.continuation.lastMutationKind)}
        </CheckInStatus>
      ) : null}
      {mode === "ambiguous" ? (
        <CheckInButton
          label={c.checkState}
          onPress={() => void session.retryCorrectionRecovery()}
        />
      ) : (
        <>
          <CheckInButton
            label={c.editIdentity}
            onPress={() => session.editVehicleIdentity()}
            variant="secondary"
          />
          <CheckInButton
            label={c.editDetails}
            onPress={() => session.editVehicleDetails()}
            variant="secondary"
          />
          <CheckInButton
            label={copy.continueLabel}
            onPress={() => session.continueVehicleIntake()}
          />
        </>
      )}
    </>
  );
}

function VehicleDetailsCard({
  active,
  c,
  textAlign,
}: {
  readonly active: NonNullable<EmployeeCheckInSnapshot["active"]>;
  readonly c: NativeCheckInContinuationCopy;
  readonly textAlign: NativeTextAlign;
}) {
  return (
    <EmployeeCard>
      {(
        [
          [c.make, active.vehicle.make],
          [c.model, active.vehicle.model],
          [c.color, active.vehicle.color],
        ] as const
      ).map(([label, value]) => (
        <Text
          key={label}
          style={[s.text, checkInTextStyle("human", textAlign)]}
        >
          {label}: {value ?? c.unknown}
        </Text>
      ))}
    </EmployeeCard>
  );
}

function ContinuationBoundary({
  copy,
  onClose,
  snapshot,
  textAlign,
}: ContinuationStepProps) {
  return (
    <>
      <EmployeeBadge
        label={copy.intakeSavedStatus}
        textAlign={textAlign}
        variant="primary"
      />
      {snapshot.active ? (
        <VehicleCard
          fallback={copy.vehicle}
          textAlign={textAlign}
          vehicle={snapshot.active.vehicle}
        />
      ) : null}
      <EmployeeCard>
        <CheckInStatus textAlign={textAlign}>{copy.createdBody}</CheckInStatus>
      </EmployeeCard>
      <CheckInButton label={copy.close} onPress={onClose} />
    </>
  );
}

function mutationMessage(
  copy: NativeCheckInContinuationCopy,
  kind: NonNullable<
    EmployeeCheckInSnapshot["continuation"]["lastMutationKind"]
  >,
): string {
  if (kind === "DETAILS_NO_CHANGE") return copy.detailsNoChange;
  if (kind === "DETAILS_UPDATED") return copy.detailsSaved;
  if (kind === "IDENTITY_UPDATED") return copy.identitySaved;
  return copy.reconciled;
}
