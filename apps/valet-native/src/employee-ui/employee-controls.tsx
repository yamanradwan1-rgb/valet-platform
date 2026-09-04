import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type AccessibilityState,
} from "react-native";
import type { ReactNode } from "react";

import {
  employeeButtonHeights,
  employeeColors as c,
  employeeFeedbackColors,
  employeeMinimumTouchTarget,
  employeeRadius,
  employeeSpacing,
} from "./employee-tokens";
import { employeeTypography } from "./employee-typography";

export const employeeControlStyles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: employeeRadius.primary,
    justifyContent: "center",
    paddingHorizontal: employeeSpacing.lg,
    paddingVertical: employeeSpacing.sm,
  },
  buttonLabel: { ...employeeTypography.button, textAlign: "center" },
  disabled: { opacity: 0.4 },
  primary: { backgroundColor: c.blue },
  secondary: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderWidth: 1,
  },
  ghost: { backgroundColor: "transparent" },
});

const labelColors = { primary: c.white, secondary: c.navy, ghost: c.blue };
const pressedColors = {
  primary: employeeFeedbackColors.primaryPressed,
  secondary: employeeFeedbackColors.secondaryPressed,
  ghost: c.ice,
};

export function EmployeeButton({
  label,
  onPress,
  variant = "primary",
  size = variant === "primary"
    ? "large"
    : variant === "secondary"
      ? "standard"
      : "compact",
  disabled = false,
  role = "button",
  accessibilityState,
  busy = false,
  leading,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: "primary" | "secondary" | "ghost";
  readonly size?: keyof typeof employeeButtonHeights;
  readonly disabled?: boolean;
  readonly role?: AccessibilityRole;
  readonly accessibilityState?: AccessibilityState;
  readonly busy?: boolean;
  readonly leading?: ReactNode;
}) {
  const height = employeeButtonHeights[size];
  const hitExtension = Math.max(0, (employeeMinimumTouchTarget - height) / 2);
  const isDisabled = disabled || busy;
  return (
    // Reserve the hit area in layout so compact siblings never overlap it.
    <View
      style={{
        minHeight: employeeMinimumTouchTarget,
        justifyContent: "center",
      }}
    >
      <Pressable
        accessibilityLabel={label}
        accessibilityRole={role}
        accessibilityState={{
          ...accessibilityState,
          ...(busy ? { busy: true } : {}),
          disabled: isDisabled,
        }}
        disabled={isDisabled}
        hitSlop={hitExtension}
        onPress={() => {
          if (!isDisabled) onPress();
        }}
        style={({ pressed }) => [
          employeeControlStyles.button,
          employeeControlStyles[variant],
          { minHeight: height, minWidth: employeeMinimumTouchTarget },
          pressed &&
            !isDisabled && {
              backgroundColor: pressedColors[variant],
            },
          isDisabled && employeeControlStyles.disabled,
        ]}
      >
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: employeeSpacing.compact,
          }}
        >
          {busy ? (
            <ActivityIndicator
              accessible={false}
              color={variant === "primary" ? c.white : c.blue}
              size="small"
            />
          ) : (
            leading
          )}
          <Text
            style={[
              employeeControlStyles.buttonLabel,
              { color: labelColors[variant] },
              size !== "large" && {
                fontSize: employeeTypography.body.fontSize,
              },
            ]}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
