import type {
  EmployeeLocale,
  EmployeeOperationalScope,
} from "@valet/employee-client";
import { StyleSheet, Text, View } from "react-native";

import { employeeColors as c } from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeFontWeights,
} from "../employee-ui/employee-typography";
import { NativeGateLocaleToggle } from "./native-gate-primitives";

export function nativeRoleInitials(role: string): "VE" | "VS" | null {
  if (role === "VALET_EMPLOYEE") return "VE";
  if (role === "VALET_SUPERVISOR") return "VS";
  return null;
}

export function NativeActiveHeaderUtilities({
  locale,
  onSelectLocale,
  role,
}: {
  readonly locale: EmployeeLocale;
  readonly onSelectLocale: (locale: EmployeeLocale) => void;
  readonly role: EmployeeOperationalScope["role"];
}) {
  const initials = nativeRoleInitials(role);
  return (
    <>
      <NativeGateLocaleToggle
        locale={locale}
        onSelectLocale={onSelectLocale}
      />
      <View
        accessibilityLabel={initials ?? undefined}
        accessibilityRole="image"
        style={nativeActiveHeaderStyles.avatar}
        testID="native-role-avatar"
      >
        {initials === null ? null : (
          <Text style={nativeActiveHeaderStyles.avatarLabel}>{initials}</Text>
        )}
      </View>
    </>
  );
}

export const nativeActiveHeaderStyles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: c.navy3,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarLabel: {
    color: c.white,
    fontFamily: employeeFontFamilies.display,
    fontSize: 11,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 14,
  },
});
