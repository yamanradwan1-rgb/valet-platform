import type {
  EmployeeShiftStartSession,
  EmployeeShiftStartSnapshot,
} from "@valet/employee-client";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { employeeColors as c } from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeFontWeights,
  employeeTextStyle,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  NativeGateButton,
  NativeGateCard,
  nativeGateStyles,
} from "../shell/native-gate-primitives";
import { getNativeShiftCopy } from "./native-shift-copy";

export function NativeShiftStartPanel({
  locale,
  session,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly session: EmployeeShiftStartSession;
  readonly snapshot: EmployeeShiftStartSnapshot;
}) {
  const textAlign = locale === "ar" ? "right" : "left";
  const copy = getNativeShiftCopy(locale);
  const submitting = snapshot.phase === "submitting";
  const interactionLocked = submitting || snapshot.phase === "verifying";

  if (snapshot.phase === "uncertain") {
    return (
      <NativeGateCard testID="native-shift-start-uncertain">
        <View style={styles.panelContent}>
          <Text
            accessibilityRole="header"
            style={[
              styles.uncertainTitle,
              employeeTextStyle("human", textAlign),
            ]}
          >
            {copy.uncertainTitle}
          </Text>
          <Text style={[styles.body, employeeTextStyle("human", textAlign)]}>
            {copy.uncertain}
          </Text>
          <NativeGateButton
            label={copy.retryStart}
            onPress={() => void session.retry()}
          />
          <NativeGateButton
            label={copy.dismiss}
            onPress={() => session.dismissUncertain()}
            variant="secondary"
          />
        </View>
      </NativeGateCard>
    );
  }

  if (snapshot.startableLocations.length === 0) {
    return (
      <Text
        style={[styles.supporting, employeeTextStyle("human", textAlign)]}
        testID="native-shift-start-blocked"
      >
        {copy.noEligibleLocation}
      </Text>
    );
  }

  const failure =
    snapshot.phase === "conflict"
      ? copy.conflict
      : snapshot.phase === "denied"
        ? copy.denied
        : snapshot.phase === "error"
          ? copy.error
          : null;

  return (
    <NativeGateCard testID="native-shift-start-panel">
      <View style={styles.panelContent}>
        <Text style={[styles.label, employeeTextStyle("human", textAlign)]}>
          {copy.chooseLocation}
        </Text>
        {snapshot.startableLocations.map((location) => {
          const selected = snapshot.selectedLocationId === location.locationId;
          return (
            <Pressable
              accessibilityLabel={`${location.name}. ${location.code}`}
              accessibilityRole="radio"
              accessibilityState={{ disabled: interactionLocked, selected }}
              disabled={interactionLocked}
              key={location.locationId}
              onPress={() => session.selectLocation(location.locationId)}
              style={[styles.location, selected && styles.locationSelected]}
            >
              <Text
                style={[
                  styles.locationName,
                  employeeTextStyle("human", textAlign),
                ]}
              >
                {location.name}
              </Text>
              <Text
                style={[
                  styles.locationCode,
                  employeeTextStyle("identifier", textAlign),
                ]}
              >
                {location.code}
              </Text>
            </Pressable>
          );
        })}
        {failure ? (
          <Text style={[styles.error, employeeTextStyle("human", textAlign)]}>
            {failure}
          </Text>
        ) : null}
        {snapshot.phase === "verifying" ? (
          <Text style={[styles.body, employeeTextStyle("human", textAlign)]}>
            {copy.verifying}
          </Text>
        ) : null}
        <NativeGateButton
          busy={submitting}
          disabled={snapshot.selectedLocationId === null || interactionLocked}
          label={submitting ? copy.starting : copy.start}
          onPress={() => void session.start()}
        />
      </View>
    </NativeGateCard>
  );
}

export const nativeShiftStartStyles = StyleSheet.create({
  body: {
    ...nativeGateStyles.body,
  },
  error: {
    color: "#FECACA",
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.semiBold,
    lineHeight: 16,
  },
  label: {
    color: c.muted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.regular,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  location: {
    backgroundColor: "#FFFFFF0A",
    borderColor: "#FFFFFF1A",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: "100%",
  },
  locationCode: {
    color: c.muted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  locationName: {
    color: c.white,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.semiBold,
    lineHeight: 20,
  },
  locationSelected: { backgroundColor: "#176BFF33", borderColor: c.blue },
  panelContent: { gap: 12, width: "100%" },
  supporting: {
    color: c.muted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    lineHeight: 19.5,
  },
  uncertainTitle: {
    color: c.white,
    fontFamily: employeeFontFamilies.display,
    fontSize: 18,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 28,
  },
});

const styles = nativeShiftStartStyles;
