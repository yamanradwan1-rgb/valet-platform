import { Pressable, StyleSheet, Text, View } from "react-native";
import type { EmployeeCheckInSnapshot } from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  type NativeTextAlign,
  VehicleCard,
} from "./native-check-in-primitives";
import { EmployeeBadge } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeGuestAccessCopy } from "../guest-access/native-guest-access-copy";

export function NativeCheckInParkingTaskStep({
  copy,
  error,
  locale,
  onOpenGuestAccess,
  onStart,
  snapshot,
  starting,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly error: boolean;
  readonly locale: FoundationLocale;
  readonly onOpenGuestAccess?: ((sessionId: string) => void) | undefined;
  readonly onStart: () => void;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly starting: boolean;
  readonly textAlign: NativeTextAlign;
}) {
  const guestCopy = getNativeGuestAccessCopy(locale);
  const sessionId = snapshot.active?.sessionId;
  return (
    <>
      {error ? (
        <CheckInError textAlign={textAlign}>
          {copy.parkingStartFailed}
        </CheckInError>
      ) : null}
      <EmployeeBadge
        label={copy.parkingState}
        showDot
        textAlign={textAlign}
        variant="warning"
      />
      {snapshot.active ? (
        <VehicleCard
          fallback={copy.vehicle}
          textAlign={textAlign}
          vehicle={snapshot.active.vehicle}
        />
      ) : null}
      <View style={[styles.notice, textAlign === "right" && styles.noticeRtl]}>
        <View accessibilityElementsHidden style={styles.dot} />
        <Text
          style={[styles.noticeText, employeeTextStyle("human", textAlign)]}
        >
          {copy.locationTrackingParking}
        </Text>
      </View>
      <CheckInButton
        busy={starting}
        disabled={starting || snapshot.active === null}
        label={starting ? copy.startingParking : copy.startParking}
        onPress={onStart}
      />
      {sessionId && onOpenGuestAccess ? (
        <Pressable
          accessibilityLabel={guestCopy.title}
          accessibilityRole="button"
          onPress={() => onOpenGuestAccess(sessionId)}
          style={styles.guestEntry}
        >
          <Text
            style={[styles.guestTitle, employeeTextStyle("human", textAlign)]}
          >
            {guestCopy.title}
          </Text>
          <Text
            style={[styles.guestHint, employeeTextStyle("human", textAlign)]}
          >
            {guestCopy.entryHint}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

export const nativeCheckInParkingTaskStyles = StyleSheet.create({
  dot: {
    backgroundColor: c.blue,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  guestEntry: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    gap: 2,
    padding: space.lg,
  },
  guestHint: { ...type.supporting, color: c.muted },
  guestTitle: { ...type.body, color: c.navy, fontWeight: "600" },
  notice: {
    alignItems: "center",
    backgroundColor: c.ice,
    borderRadius: employeeRadius.form,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  noticeRtl: { flexDirection: "row-reverse" },
  noticeText: {
    ...type.supporting,
    color: c.blue,
    flex: 1,
    fontWeight: "600",
  },
});

const styles = nativeCheckInParkingTaskStyles;
