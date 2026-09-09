import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { EmployeeOperationalScope } from "@valet/employee-client";

import logo from "../../assets/brand/VAYLET_Logo_Light_Background.png";
import {
  employeeColors as c,
  employeeSpacing as space,
} from "./employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "./employee-typography";

export const employeeFrameStyles = StyleSheet.create({
  safeArea: { backgroundColor: c.navy3, flex: 1 },
  frame: {
    alignSelf: "center",
    backgroundColor: c.warm,
    flex: 1,
    maxWidth: 390,
    width: "100%",
  },
  appHeader: {
    alignItems: "center",
    backgroundColor: c.white,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    flexShrink: 0,
    height: 64,
    paddingHorizontal: space.screen,
  },
  brandContext: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: space.md,
    minWidth: 0,
  },
  brandLogo: {
    aspectRatio: 169 / 60,
    flexShrink: 1,
    height: 28,
    resizeMode: "contain",
  },
  context: { flexShrink: 1, minWidth: 0 },
  divider: { backgroundColor: c.border, height: 20, width: 1 },
  locationCode: {
    ...type.small,
    color: c.neutral,
    fontSize: 11,
    lineHeight: 14,
  },
  locationName: { ...type.label, color: c.navy, fontSize: 13, lineHeight: 16 },
  headerUtilities: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: space.sm,
  },
});

export function EmployeeFrame({
  children,
  direction,
}: {
  readonly children: ReactNode;
  readonly direction: "ltr" | "rtl";
}) {
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
  return (
    <View style={employeeFrameStyles.appHeader} testID="employee-app-header">
      <View style={employeeFrameStyles.brandContext}>
        <Image
          accessibilityLabel="VAYLET"
          source={logo}
          style={employeeFrameStyles.brandLogo}
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
