import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Text, View } from "react-native";
import type { EmployeeOperationalScope } from "@valet/employee-client";

import { employeeRadius } from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
  type EmployeeTextAlign,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { useNativeTaskShiftDuration } from "./use-native-task-shift-duration";

export const nativeTaskShiftStripStylesTheme = createEmployeeStyles((p) => ({
  strip: {
    alignItems: "center",
    backgroundColor: p.inverseRaised,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  indicator: {
    backgroundColor: p.success,
    borderRadius: employeeRadius.pill,
    height: 8,
    width: 8,
  },
  line: { alignItems: "center", flex: 1, flexDirection: "row", minWidth: 0 },
  primary: { ...type.supporting, color: p.onAction, fontWeight: "600" },
  secondary: { ...type.supporting, color: p.textMuted, flexShrink: 1 },
}));
export const nativeTaskShiftStripStyles = nativeTaskShiftStripStylesTheme.light;

export function NativeTaskShiftStrip({
  activeLabel,
  locale,
  scope,
  textAlign,
}: {
  readonly activeLabel: string;
  readonly locale: FoundationLocale;
  readonly scope: EmployeeOperationalScope;
  readonly textAlign: EmployeeTextAlign;
}) {
  const nativeTaskShiftStripStyles = useEmployeeStyles(
    nativeTaskShiftStripStylesTheme,
  );

  const human = employeeTextStyle("human", textAlign);
  const duration = useNativeTaskShiftDuration(scope.shiftStartedAt, locale);
  return (
    <View
      accessible
      accessibilityLabel={`${activeLabel}, ${duration}, ${scope.locationName}`}
      style={nativeTaskShiftStripStyles.strip}
      testID="native-task-shift-strip"
    >
      <View accessible={false} style={nativeTaskShiftStripStyles.indicator} />
      <View style={nativeTaskShiftStripStyles.line}>
        <Text
          numberOfLines={1}
          style={[nativeTaskShiftStripStyles.primary, human]}
        >
          {activeLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={[nativeTaskShiftStripStyles.secondary, human]}
        >
          {` · ${duration} · ${scope.locationName}`}
        </Text>
      </View>
    </View>
  );
}
