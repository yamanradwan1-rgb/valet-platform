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
  DraftVehicleCard,
  type NativeTextAlign,
  VehicleCard,
  CheckInStatus,
} from "./native-check-in-primitives";
import {
  checkInFailureMessage,
  checkInTextStyle,
} from "./native-check-in-presentation";
import { checkInStyles as s } from "./native-check-in-styles";

interface StepProps {
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
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
      <VehicleCard
        fallback={copy.vehicle}
        textAlign={textAlign}
        vehicle={vehicle}
      />
      {suggestion ? (
        <View
          accessible
          accessibilityLabel={`${copy.returningCustomer}, ${suggestion.displayName ? `${suggestion.displayName}, ` : ""}${copy.phoneEnding} ${suggestion.phoneSuffix}`}
          style={s.card}
        >
          <Text style={[s.eyebrow, checkInTextStyle("human", textAlign)]}>
            {copy.returningCustomer}
          </Text>
          {suggestion.displayName ? (
            <Text style={[s.fieldLabel, checkInTextStyle("human", textAlign)]}>
              {suggestion.displayName}
            </Text>
          ) : null}
          <Text style={[s.text, checkInTextStyle("human", textAlign)]}>
            {copy.phoneEnding}{" "}
            <Text style={{ writingDirection: "ltr" }}>
              {suggestion.phoneSuffix}
            </Text>
          </Text>
          <Text style={[s.text, checkInTextStyle("human", textAlign)]}>
            {copy.previousAssociation}
          </Text>
          <Text style={[s.text, checkInTextStyle("human", textAlign)]}>
            {copy.savedBody}
          </Text>
        </View>
      ) : null}
      {suggestion ? (
        <CheckInButton
          label={copy.useSavedCustomer}
          onPress={() => void session.useSavedCustomer()}
        />
      ) : null}
      <CheckInButton
        label={suggestion ? copy.differentCustomer : copy.continueToCustomer}
        onPress={() => session.chooseDifferentCustomer()}
        secondary={suggestion !== null}
      />
      <CheckInButton
        label={copy.edit}
        onPress={() => session.editIdentity()}
        variant="ghost"
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
        prefix="+962"
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
