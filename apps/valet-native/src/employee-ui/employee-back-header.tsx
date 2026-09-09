import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmployeeBackIcon } from "./employee-icons";
import {
  employeeColors as c,
  employeeMinimumTouchTarget,
  employeeSpacing as space,
} from "./employee-tokens";
import { employeeTypography as type } from "./employee-typography";

export const employeeBackHeaderStyles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: c.warm,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    gap: space.sm,
    minHeight: 56,
    paddingHorizontal: space.screen,
    paddingVertical: space.xs,
  },
  button: {
    alignItems: "center",
    height: employeeMinimumTouchTarget,
    justifyContent: "center",
    width: employeeMinimumTouchTarget,
  },
  disabled: { opacity: 0.4 },
  title: {
    ...type.backHeaderTitle,
    color: c.navy,
    flex: 1,
    flexShrink: 1,
  },
});

export function EmployeeBackHeader({
  accessibilityLabel,
  disabled = false,
  direction,
  onBack,
  textAlign,
  title,
}: {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly direction: "ltr" | "rtl";
  readonly onBack: () => void;
  readonly textAlign: "left" | "right";
  readonly title: string;
}) {
  return (
    <View
      style={[
        employeeBackHeaderStyles.header,
        { flexDirection: direction === "rtl" ? "row-reverse" : "row" },
      ]}
    >
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={4}
        onPress={() => {
          if (!disabled) onBack();
        }}
        style={[
          employeeBackHeaderStyles.button,
          disabled && employeeBackHeaderStyles.disabled,
        ]}
      >
        <EmployeeBackIcon direction={direction} />
      </Pressable>
      <Text
        accessibilityRole="header"
        style={[employeeBackHeaderStyles.title, { textAlign }]}
      >
        {title}
      </Text>
    </View>
  );
}
