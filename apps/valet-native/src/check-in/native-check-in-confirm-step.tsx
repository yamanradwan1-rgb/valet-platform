import { StyleSheet, Text, View } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  type NativeTextAlign,
} from "./native-check-in-primitives";
import { checkInIdentityLabel } from "./native-check-in-presentation";
import { isPlateCountry } from "./native-plate-country-selector";
import { EmployeeCard } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";

export function NativeConfirmStep({
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
  const hasPlate = snapshot.vehicle.mode === "CONFIRMED_PLATE";
  const confirmation = hasPlate ? copy.confirmPlate : copy.confirmDescription;
  const identity = checkInIdentityLabel(snapshot, copy.vehicle);
  return (
    <>
      {snapshot.error ? (
        <CheckInError textAlign={textAlign}>
          {copy.recognitionError}
        </CheckInError>
      ) : null}
      <View style={styles.hero}>
        <Text
          style={[
            styles.status,
            employeeTextStyle("human", textAlign, "center"),
          ]}
        >
          {hasPlate ? copy.manualEntry : copy.temporaryDescriptor}
        </Text>
        <Text
          style={[
            hasPlate ? styles.plate : styles.descriptor,
            employeeTextStyle(
              hasPlate ? "identifier" : "human",
              textAlign,
              "center",
            ),
          ]}
        >
          {identity}
        </Text>
        {hasPlate ? (
          <CountryContext
            country={snapshot.vehicle.plateCountry}
            copy={copy}
            textAlign={textAlign}
          />
        ) : null}
      </View>
      <EmployeeCard accessibilityLabel={`${copy.vehicle}: ${identity}`}>
        <Text style={[styles.cardLabel, employeeTextStyle("human", textAlign)]}>
          {copy.vehicle}
        </Text>
        <Text
          style={[
            styles.cardIdentity,
            employeeTextStyle(hasPlate ? "identifier" : "human", textAlign),
          ]}
        >
          {identity}
        </Text>
        {hasPlate ? (
          <CountryContext
            country={snapshot.vehicle.plateCountry}
            copy={copy}
            textAlign={textAlign}
          />
        ) : (
          <Text style={[styles.context, employeeTextStyle("human", textAlign)]}>
            {copy.temporaryDescriptor}
          </Text>
        )}
      </EmployeeCard>
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

function CountryContext({
  copy,
  country,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly country: string;
  readonly textAlign: NativeTextAlign;
}) {
  const countryName = isPlateCountry(country)
    ? copy.countryNames[country]
    : country;
  return (
    <Text
      style={[styles.context, employeeTextStyle("human", textAlign, "center")]}
    >
      {countryName} <Text style={styles.code}>({country})</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  cardIdentity: { ...type.header, color: c.navy },
  cardLabel: {
    ...type.small,
    color: c.muted,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  code: { writingDirection: "ltr" },
  context: { ...type.small, color: c.neutral, fontWeight: "600" },
  descriptor: { ...type.vehicle, color: c.navy },
  hero: {
    alignItems: "center",
    backgroundColor: c.ice,
    borderRadius: employeeRadius.primary,
    gap: space.sm,
    padding: space.hero,
  },
  plate: {
    ...type.plate,
    color: c.navy,
    letterSpacing: 4,
  },
  status: {
    ...type.small,
    color: c.neutral,
    fontWeight: "600",
    letterSpacing: 0.75,
  },
});
