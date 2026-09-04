import { Text, View } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  CheckInField,
  CheckInStatus,
  type NativeTextAlign,
  VehicleCard,
} from "./native-check-in-primitives";
import {
  checkInFailureMessage,
  checkInIdentityLabel,
  checkInTextStyle,
} from "./native-check-in-presentation";
import { checkInStyles as s } from "./native-check-in-styles";

interface StepProps {
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

export function NativeConfirmStep({
  copy,
  session,
  snapshot,
  textAlign,
}: StepProps) {
  const error = checkInFailureMessage(copy, snapshot.error);
  const confirmation =
    snapshot.vehicle.mode === "CONFIRMED_PLATE"
      ? copy.confirmPlate
      : copy.confirmDescription;
  return (
    <>
      <Text accessibilityRole="header" style={[s.title, { textAlign }]}>
        {confirmation}
      </Text>
      <View style={s.hero}>
        <Text style={s.badge}>
          {snapshot.vehicle.mode === "CONFIRMED_PLATE"
            ? copy.enterPlate
            : copy.noPlate}
        </Text>
        <Text
          style={[
            s.heroPlate,
            snapshot.vehicle.mode === "TEMPORARY_DESCRIPTOR" && {
              letterSpacing: 0,
            },
            checkInTextStyle(
              snapshot.vehicle.mode === "CONFIRMED_PLATE"
                ? "identifier"
                : "human",
              textAlign,
            ),
          ]}
        >
          {checkInIdentityLabel(snapshot, copy.vehicle)}
        </Text>
      </View>
      {error ? (
        <CheckInError textAlign={textAlign}>
          {copy.recognitionError}
        </CheckInError>
      ) : null}
      <CheckInButton
        label={confirmation}
        onPress={() => void session.confirmIdentity()}
      />
      {error ? (
        <CheckInButton
          label={copy.continueWithoutRecognition}
          onPress={() => session.continueWithoutRecognition()}
          secondary
        />
      ) : null}
      <CheckInButton
        label={copy.edit}
        onPress={() => session.editIdentity()}
        secondary
      />
    </>
  );
}

export function NativeReturningStep({
  copy,
  session,
  snapshot,
  textAlign,
}: StepProps) {
  const vehicle = snapshot.recognizedVehicle;
  if (vehicle === null) return null;
  const suggestion = vehicle.returningCustomer;
  return (
    <>
      <Text accessibilityRole="header" style={[s.title, { textAlign }]}>
        {copy.vehicleFound}
      </Text>
      <VehicleCard
        fallback={copy.vehicle}
        textAlign={textAlign}
        vehicle={vehicle}
      />
      {suggestion ? (
        <View style={s.card}>
          <Text style={s.badge}>{copy.previousAssociation}</Text>
          {suggestion.displayName ? (
            <Text style={[s.fieldLabel, { textAlign }]}>
              {suggestion.displayName}
            </Text>
          ) : null}
          <Text style={[s.text, { textAlign }]}>
            {copy.phoneEnding}{" "}
            <Text style={{ writingDirection: "ltr" }}>
              {suggestion.phoneSuffix}
            </Text>
          </Text>
          <CheckInStatus textAlign={textAlign}>{copy.savedBody}</CheckInStatus>
        </View>
      ) : null}
      {suggestion ? (
        <CheckInButton
          label={copy.useSavedCustomer}
          onPress={() => void session.useSavedCustomer()}
        />
      ) : null}
      <CheckInButton
        label={suggestion ? copy.differentCustomer : copy.continueLabel}
        onPress={() => session.chooseDifferentCustomer()}
        secondary={suggestion !== null}
      />
      <CheckInButton
        label={copy.edit}
        onPress={() => session.editIdentity()}
        secondary
      />
    </>
  );
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
      <Text accessibilityRole="header" style={[s.title, { textAlign }]}>
        {copy.customerContact}
      </Text>
      {vehicle ? (
        <VehicleCard
          fallback={copy.vehicle}
          textAlign={textAlign}
          vehicle={vehicle}
        />
      ) : null}
      <CheckInField
        accessibilityLabel={copy.phone}
        kind="identifier"
        textAlign={textAlign}
        prefix="+962"
        inputMode="tel"
        maxLength={20}
        onChangeText={(customerPhone) =>
          session.setCustomerPhone(customerPhone)
        }
        placeholder="79 000 0000"
        value={snapshot.customerPhone}
      />
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
        secondary
      />
      <CheckInButton
        label={copy.edit}
        onPress={() => session.editIdentity()}
        secondary
      />
    </>
  );
}
