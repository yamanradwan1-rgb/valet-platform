import type { EmployeeCheckInSnapshot } from "@valet/employee-client";

import type { ContinuationStepProps } from "./native-check-in-continuation-step";
import {
  CheckInButton,
  CheckInError,
  CheckInField,
  CheckInStatus,
  DraftVehicleCard,
} from "./native-check-in-primitives";

export function ContinuationDetailsEditor({
  continuationCopy: c,
  session,
  snapshot,
  textAlign,
}: ContinuationStepProps) {
  const draft = snapshot.continuation.detailsDraft;
  return (
    <>
      {(["make", "model", "color"] as const).map((field) => (
        <CheckInField
          key={field}
          accessibilityLabel={c[field]}
          kind="human"
          maxLength={80}
          onChangeText={(value) =>
            session.setVehicleDetails({ [field]: value })
          }
          textAlign={textAlign}
          placeholder={c.unknown}
          value={draft[field]}
        />
      ))}
      <ContinuationError {...{ c, snapshot, textAlign }} />
      <CheckInButton
        label={c.saveDetails}
        onPress={() => void session.submitVehicleDetails()}
      />
      <CheckInButton
        label={c.cancel}
        onPress={() => session.cancelVehicleEdit()}
        variant="ghost"
      />
    </>
  );
}

export function ContinuationIdentityEditor({
  continuationCopy: c,
  copy,
  session,
  snapshot,
  textAlign,
}: ContinuationStepProps) {
  const continuation = snapshot.continuation;
  const draft = continuation.identityDraft;
  if (continuation.mode === "confirm-identity") {
    return (
      <>
        <DraftVehicleCard
          fallback={copy.vehicle}
          newVehicleLabel={c.authoritative}
          textAlign={textAlign}
          vehicle={draft}
        />
        <CheckInStatus textAlign={textAlign}>
          {c.confirmPlateBody}
        </CheckInStatus>
        <ContinuationError {...{ c, snapshot, textAlign }} />
        <CheckInButton
          label={c.confirmPlateSave}
          onPress={() => void session.submitIdentityCorrection()}
        />
        <CheckInButton
          label={c.cancel}
          onPress={() => session.cancelVehicleEdit()}
          variant="ghost"
        />
      </>
    );
  }
  const plate = draft.mode === "CONFIRMED_PLATE";
  return (
    <>
      <CheckInButton
        label={c.usePlate}
        onPress={() => session.setVehicleIdentity({ mode: "CONFIRMED_PLATE" })}
        role="tab"
        selected={plate}
        variant={plate ? "primary" : "secondary"}
      />
      <CheckInButton
        label={c.useDescriptor}
        onPress={() =>
          session.setVehicleIdentity({ mode: "TEMPORARY_DESCRIPTOR" })
        }
        role="tab"
        selected={!plate}
        variant={!plate ? "primary" : "secondary"}
      />
      {plate ? (
        <>
          <CheckInField
            accessibilityLabel={c.plateCountry}
            kind="identifier"
            maxLength={2}
            onChangeText={(plateCountry) =>
              session.setVehicleIdentity({ plateCountry })
            }
            textAlign={textAlign}
            value={draft.plateCountry}
          />
          <CheckInField
            accessibilityLabel={c.plateNumber}
            kind="identifier"
            maxLength={64}
            onChangeText={(plateNumberRaw) =>
              session.setVehicleIdentity({ plateNumberRaw })
            }
            textAlign={textAlign}
            value={draft.plateNumberRaw}
          />
        </>
      ) : (
        <CheckInField
          accessibilityLabel={c.descriptor}
          kind="human"
          maxLength={160}
          onChangeText={(temporaryDescriptor) =>
            session.setVehicleIdentity({ temporaryDescriptor })
          }
          textAlign={textAlign}
          value={draft.temporaryDescriptor}
        />
      )}
      <ContinuationError {...{ c, snapshot, textAlign }} />
      <CheckInButton
        label={plate ? c.reviewPlate : c.saveDescription}
        onPress={() => session.reviewVehicleIdentity()}
      />
      <CheckInButton
        label={c.cancel}
        onPress={() => session.cancelVehicleEdit()}
        variant="ghost"
      />
    </>
  );
}

function ContinuationError({
  c,
  snapshot,
  textAlign,
}: Pick<ContinuationStepProps, "snapshot" | "textAlign"> & {
  readonly c: ContinuationStepProps["continuationCopy"];
}) {
  const error = correctionErrorMessage(c, snapshot);
  return error ? (
    <CheckInError textAlign={textAlign}>{error}</CheckInError>
  ) : null;
}

function correctionErrorMessage(
  copy: ContinuationStepProps["continuationCopy"],
  snapshot: EmployeeCheckInSnapshot,
): string | null {
  const code = snapshot.error?.code;
  if (!code) return null;
  if (code.endsWith("_INVALID")) return copy.invalid;
  if (code.endsWith("_SESSION_NOT_MUTABLE")) return copy.notMutable;
  if (code === "VEHICLE_IDENTITY_CONFLICT") return copy.identityConflict;
  if (code === "VEHICLE_IDENTITY_CUSTODY_CONFLICT") return copy.custodyConflict;
  if (code === "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED")
    return copy.confirmPlateBody;
  return copy.conflictBody;
}
