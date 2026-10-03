import { Pressable, StyleSheet, Text } from "react-native";
import type { EmployeeLocale } from "@valet/employee-client";
import { EmployeeTorchIcon } from "../employee-ui/employee-icons";
import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing,
  employeeMinimumTouchTarget,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography,
} from "../employee-ui/employee-typography";

export const nativePlateTorchCopy = {
  en: { label: "Flashlight", on: "On", off: "Off" },
  ar: { label: "المصباح", on: "تشغيل", off: "إيقاف" },
} as const;

export function NativePlateTorchControl({
  enabled,
  locale,
  onPress,
}: {
  readonly enabled: boolean;
  readonly locale: EmployeeLocale;
  readonly onPress: () => void;
}) {
  const copy = nativePlateTorchCopy[locale];
  const color = enabled ? c.white : c.navy;
  return (
    <Pressable
      testID="plate-torch"
      accessibilityRole="switch"
      accessibilityLabel={copy.label}
      accessibilityState={{ checked: enabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: enabled ? c.blue : c.white,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <EmployeeTorchIcon color={color} />
      <Text
        style={[
          styles.label,
          { color },
          employeeTextStyle(
            "human",
            locale === "ar" ? "right" : "left",
            "center",
          ),
        ]}
      >
        {enabled ? copy.on : copy.off}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    position: "absolute",
    top: employeeSpacing.sm,
    right: employeeSpacing.sm,
    minWidth: employeeMinimumTouchTarget,
    height: employeeMinimumTouchTarget,
    paddingHorizontal: employeeSpacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: employeeRadius.form,
  },
  label: { ...employeeTypography.supporting },
});
