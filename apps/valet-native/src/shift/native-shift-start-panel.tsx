import type {
  EmployeeShiftStartSession,
  EmployeeShiftStartSnapshot,
} from "@valet/employee-client";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeError } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
  employeeMinimumTouchTarget,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
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
  const direction = locale === "ar" ? "row-reverse" : "row";
  const copy = getNativeShiftCopy(locale);
  const busy = snapshot.phase === "submitting";
  const interactionLocked = busy || snapshot.phase === "verifying";

  if (snapshot.phase === "uncertain") {
    return (
      <View style={styles.panel} testID="native-shift-start-uncertain">
        <Text style={[styles.title, employeeTextStyle("human", textAlign)]}>
          {copy.uncertainTitle}
        </Text>
        <Text style={[styles.body, employeeTextStyle("human", textAlign)]}>
          {copy.uncertain}
        </Text>
        <EmployeeButton
          label={copy.retryStart}
          onPress={() => void session.retry()}
        />
        <EmployeeButton
          label={copy.dismiss}
          onPress={() => session.dismissUncertain()}
          variant="ghost"
        />
      </View>
    );
  }

  if (snapshot.startableLocations.length === 0) {
    return (
      <Text
        style={[styles.body, employeeTextStyle("human", textAlign)]}
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
    <View style={styles.panel} testID="native-shift-start-panel">
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
            style={[
              styles.location,
              { flexDirection: direction },
              selected ? styles.locationSelected : null,
            ]}
          >
            <View style={styles.locationText}>
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
            </View>
            <View
              style={[styles.radio, selected ? styles.radioSelected : null]}
            />
          </Pressable>
        );
      })}
      {failure ? (
        <EmployeeError textAlign={textAlign}>{failure}</EmployeeError>
      ) : null}
      {snapshot.phase === "verifying" ? (
        <Text style={[styles.body, employeeTextStyle("human", textAlign)]}>
          {copy.verifying}
        </Text>
      ) : null}
      <EmployeeButton
        busy={busy}
        disabled={
          snapshot.selectedLocationId === null || snapshot.phase === "verifying"
        }
        label={busy ? copy.starting : copy.start}
        onPress={() => void session.start()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { ...type.small, color: c.muted },
  label: { ...type.badge, color: c.muted, textTransform: "uppercase" },
  location: {
    alignItems: "center",
    backgroundColor: "#FFFFFF0A",
    borderColor: "#FFFFFF1A",
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    gap: space.md,
    minHeight: employeeMinimumTouchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  locationCode: { ...type.small, color: c.muted },
  locationName: { ...type.label, color: c.white },
  locationSelected: { backgroundColor: "#176BFF33", borderColor: c.blue },
  locationText: { flex: 1, gap: 2, minWidth: 0 },
  panel: { gap: space.md, width: "100%" },
  radio: {
    borderColor: c.muted,
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16,
  },
  radioSelected: { backgroundColor: c.blue, borderColor: c.white },
  title: { ...type.label, color: c.white, fontSize: 18, fontWeight: "700" },
});
