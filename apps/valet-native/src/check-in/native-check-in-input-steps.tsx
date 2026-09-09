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
  VehicleCard,
  CheckInStatus,
} from "./native-check-in-primitives";
import { checkInFailureMessage } from "./native-check-in-presentation";

interface StepProps {
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

export function NativeCustomerStep({
  copy,
  session,
  snapshot,
  textAlign,
}: StepProps) {
  const error = checkInFailureMessage(copy, snapshot.error);
  const vehicle = snapshot.recognizedVehicle;
  return (
    <>
      {vehicle ? (
        <VehicleCard
          fallback={copy.vehicle}
          textAlign={textAlign}
          vehicle={vehicle}
        />
      ) : (
        <DraftVehicleCard
          fallback={copy.vehicle}
          newVehicleLabel={copy.newVehicle}
          textAlign={textAlign}
          vehicle={snapshot.vehicle}
        />
      )}
      <CheckInField
        accessibilityLabel={copy.phone}
        kind="identifier"
        textAlign={textAlign}
        prefix="🇯🇴  +962"
        inputMode="tel"
        maxLength={20}
        onChangeText={(customerPhone) =>
          session.setCustomerPhone(customerPhone)
        }
        placeholder="79 000 0000"
        value={snapshot.customerPhone}
      />
      <CheckInStatus textAlign={textAlign}>{copy.smsNotice}</CheckInStatus>
      {error ? (
        <CheckInError textAlign={textAlign}>{error}</CheckInError>
      ) : null}
      <CheckInButton
        label={copy.continueLabel}
        onPress={() => void session.submitCustomer()}
      />
      <CheckInButton
        label={copy.noPhone}
        onPress={() => {
          session.setCustomerPhone("");
          void session.submitCustomer();
        }}
        variant="ghost"
      />
    </>
  );
}
