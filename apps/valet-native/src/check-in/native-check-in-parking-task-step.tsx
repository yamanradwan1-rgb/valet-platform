import { StyleSheet, Text, View } from "react-native";
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

export function NativeCheckInParkingTaskStep({
  copy,
  error,
  onStart,
  snapshot,
  starting,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly error: boolean;
  readonly onStart: () => void;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly starting: boolean;
  readonly textAlign: NativeTextAlign;
}) {
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
