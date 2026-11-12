import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  EmployeeLocale,
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
import { NativeCheckInColorSelector } from "./native-check-in-color-selector";

export function NativeVehicleDetailsStep({
  copy,
  locale,
  session,
  snapshot,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly locale: EmployeeLocale;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}) {
  const noPlate = snapshot.vehicle.mode === "TEMPORARY_DESCRIPTOR";
  const error = checkInFailureMessage(copy, snapshot.error);
  const update = (
    field: "make" | "model" | "temporaryDescriptor",
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
      {(["make", "model"] as const).map((field) => (
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
      <NativeCheckInColorSelector
        color={snapshot.vehicle.color ?? null}
        label={copy.color}
        locale={locale}
        onChange={(color) => session.setPreIntakeVehicleDetails({ color })}
        textAlign={textAlign}
      />
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
