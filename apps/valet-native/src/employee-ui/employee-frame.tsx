import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import {
  useEmployeeStyles,
  useEmployeePalette,
} from "../appearance/employee-appearance-context";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { EmployeeOperationalScope } from "@valet/employee-client";

import { EmployeeBrandLogo } from "./employee-brand-logo";
import { employeeSpacing as space } from "./employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "./employee-typography";

export const employeeFrameStylesTheme = createEmployeeStyles((p) => ({
  safeArea: { backgroundColor: p.inverseRaised, flex: 1 },
  frame: {
    alignSelf: "center",
    backgroundColor: p.appBackground,
    flex: 1,
    maxWidth: 390,
    position: "relative",
    width: "100%",
  },
  appHeader: {
    direction: "ltr",
    alignItems: "center",
    backgroundColor: p.surface,
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    flexShrink: 0,
    height: 64,
    paddingHorizontal: space.screen,
  },
  brandContext: {
    direction: "ltr",
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: space.md,
    minWidth: 0,
  },
  brandLogo: {
    flexShrink: 1,
  },
  context: { flexShrink: 1, minWidth: 0 },
  divider: { backgroundColor: p.border, height: 20, width: 1 },
  locationCode: {
    ...type.small,
    color: p.textSecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  locationName: {
    ...type.label,
    color: p.textPrimary,
    fontSize: 13,
    lineHeight: 16,
  },
  headerUtilities: {
    direction: "ltr",
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: space.sm,
  },
}));
export const employeeFrameStyles = employeeFrameStylesTheme.light;

export function EmployeeFrame({
  children,
  direction,
}: {
  readonly children: ReactNode;
  readonly direction: "ltr" | "rtl";
}) {
  const employeeFrameStyles = useEmployeeStyles(employeeFrameStylesTheme);

  return (
    <SafeAreaView style={employeeFrameStyles.safeArea}>
      <StatusBar style="light" />
      <View
        style={[employeeFrameStyles.frame, { direction }]}
        testID="employee-frame"
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

export function EmployeeAppHeader({
  scope,
  utilities,
  textAlign,
}: {
  readonly scope: EmployeeOperationalScope | null;
  readonly utilities: ReactNode;
  readonly textAlign: "left" | "right";
}) {
  const p = useEmployeePalette();
  const employeeFrameStyles = useEmployeeStyles(employeeFrameStylesTheme);

  return (
    <View style={employeeFrameStyles.appHeader} testID="employee-app-header">
      <View style={employeeFrameStyles.brandContext}>
        <EmployeeBrandLogo
          height={28}
          surface={p.mode}
          style={[
            employeeFrameStyles.brandLogo,
            // Keep the current header's Light bounding box for either official
            // asset; contain preserves the Dark wordmark's intrinsic ratio.
            p.mode === "dark" && { aspectRatio: 169 / 60 },
          ]}
        />
        {scope ? <View style={employeeFrameStyles.divider} /> : null}
        {scope ? (
          <View style={employeeFrameStyles.context}>
            <Text
              numberOfLines={1}
              style={[
                employeeFrameStyles.locationName,
                employeeTextStyle("human", textAlign),
              ]}
            >
              {scope.locationName}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                employeeFrameStyles.locationCode,
                employeeTextStyle("identifier", textAlign),
              ]}
            >
              {scope.locationCode}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={employeeFrameStyles.headerUtilities}>{utilities}</View>
    </View>
  );
}
