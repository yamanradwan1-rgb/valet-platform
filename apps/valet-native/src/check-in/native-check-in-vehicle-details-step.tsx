import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  CheckInField,
  DraftVehicleCard,
  type NativeTextAlign,
} from "./native-check-in-primitives";
import { checkInFailureMessage } from "./native-check-in-presentation";

export function NativeVehicleDetailsStep({
  copy,
  session,
  snapshot,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}) {
  const noPlate = snapshot.vehicle.mode === "TEMPORARY_DESCRIPTOR";
  const error = checkInFailureMessage(copy, snapshot.error);
  const update = (
    field: "color" | "make" | "model" | "temporaryDescriptor",
    value: string,
  ) => session.setPreIntakeVehicleDetails({ [field]: value });
  return (
    <>
      <DraftVehicleCard
        fallback={noPlate ? copy.noPlate : copy.vehicle}
        newVehicleLabel={copy.vehicle}
        textAlign={textAlign}
        vehicle={snapshot.vehicle}
      />
      {noPlate ? (
        <CheckInField
          accessibilityLabel={copy.vehicleDescription}
          kind="human"
          maxLength={160}
          onChangeText={(value) => update("temporaryDescriptor", value)}
          placeholder={copy.vehicleDescriptionExample}
          textAlign={textAlign}
          value={snapshot.vehicle.temporaryDescriptor}
        />
      ) : null}
      {(["make", "model", "color"] as const).map((field) => (
        <CheckInField
          accessibilityLabel={copy[field]}
          key={field}
          kind="human"
          maxLength={80}
          onChangeText={(value) => update(field, value)}
          textAlign={textAlign}
          value={snapshot.vehicle[field] ?? ""}
        />
      ))}
      {error ? (
        <CheckInError textAlign={textAlign}>{error}</CheckInError>
      ) : null}
      <CheckInButton
        label={copy.continueLabel}
        onPress={() => session.continueVehicleDetails()}
      />
      <CheckInButton
        disabled={noPlate && snapshot.vehicle.temporaryDescriptor.trim() === ""}
        label={copy.skipVehicleDetails}
        onPress={() => {
          session.setPreIntakeVehicleDetails({
            color: null,
            make: null,
            model: null,
          });
          session.continueVehicleDetails();
        }}
        variant="ghost"
      />
    </>
  );
}
