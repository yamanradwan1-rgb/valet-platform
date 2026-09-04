import { StyleSheet, Text, View } from "react-native";
import type { EmployeeOperationalScope } from "@valet/employee-client";

import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
  type EmployeeTextAlign,
} from "../employee-ui/employee-typography";

export const nativeTaskShiftStripStyles = StyleSheet.create({
  strip: {
    alignItems: "center",
    backgroundColor: c.navy3,
    borderRadius: employeeRadius.form,
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  indicator: {
    backgroundColor: c.success,
    borderRadius: employeeRadius.pill,
    height: 8,
    width: 8,
  },
  copy: { flex: 1 },
  primary: { ...type.small, color: c.white, fontWeight: "600" },
  secondary: { ...type.small, color: c.muted },
});

export function NativeTaskShiftStrip({
  activeLabel,
  scope,
  textAlign,
}: {
  readonly activeLabel: string;
  readonly scope: EmployeeOperationalScope;
  readonly textAlign: EmployeeTextAlign;
}) {
  const humanText = employeeTextStyle("human", textAlign);
  return (
    <View
      accessible
      accessibilityLabel={`${activeLabel}, ${scope.locationName}`}
      style={[
        nativeTaskShiftStripStyles.strip,
        { direction: textAlign === "right" ? "rtl" : "ltr" },
      ]}
      testID="native-task-shift-strip"
    >
      <View accessible={false} style={nativeTaskShiftStripStyles.indicator} />
      <View style={nativeTaskShiftStripStyles.copy}>
        <Text style={[nativeTaskShiftStripStyles.primary, humanText]}>
          {activeLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={[nativeTaskShiftStripStyles.secondary, humanText]}
        >
          {scope.locationName}
        </Text>
      </View>
    </View>
  );
}
