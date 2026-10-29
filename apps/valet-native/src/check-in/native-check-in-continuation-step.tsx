import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Text } from "react-native";
import type {
  ConditionPhotoSnapshot,
  EmployeeConditionPhotoSession,
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  EmployeeLocale,
} from "@valet/employee-client";
import type { NativeConditionPhotoFiles } from "./native-condition-photo-files";

import type { NativeCheckInConditionCopy } from "./native-check-in-condition-copy";
import { NativeCheckInConditionStep } from "./native-check-in-condition-step";
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
import { checkInStylesTheme as sTheme } from "./native-check-in-styles";
import {
  EmployeeBadge,
  EmployeeCard,
  EmployeeProgress,
} from "../employee-ui/employee-feedback";

export interface ContinuationStepProps {
  readonly conditionCopy: NativeCheckInConditionCopy;
  readonly continuationCopy: NativeCheckInContinuationCopy;
  readonly copy: NativeCheckInCopy;
  readonly onClose: () => void;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
  readonly locale: EmployeeLocale;
  readonly files: NativeConditionPhotoFiles;
  readonly photo: EmployeeConditionPhotoSession;
  readonly photoSnapshot: ConditionPhotoSnapshot;
  readonly onPrepareCapture?: (handle: string) => Promise<string | null>;
  readonly onReleaseCapture?: (handle: string) => void;
}

export function NativeCheckInContinuationStep(props: ContinuationStepProps) {
  const mode = props.snapshot.continuation.mode;
  if (mode === "submitting" || mode === "reconciling") {
    const conditionInFlight =
      props.snapshot.continuation.pendingConditionSelection !== null;
    return (
      <EmployeeProgress
        label={
          conditionInFlight
            ? mode === "submitting"
              ? props.conditionCopy.completingCondition
              : props.conditionCopy.checkingConditionState
            : mode === "submitting"
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
  // MOB-011B condition/completion step. The shared "ambiguous" mode is routed
  // by its pending intent: a pending correction stays on the correction
  // recovery presentation, a pending condition selection stays here.
  if (
    mode === "select-condition" ||
    mode === "boundary" ||
    (mode === "ambiguous" &&
      props.snapshot.continuation.pendingConditionSelection !== null)
  )
    return <NativeCheckInConditionStep {...props} />;
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
  const s = useEmployeeStyles(sTheme);

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
