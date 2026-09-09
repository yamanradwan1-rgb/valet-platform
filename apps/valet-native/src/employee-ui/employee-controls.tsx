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
  buttonLabel: {
    ...employeeTypography.button,
    flexShrink: 1,
    textAlign: "center",
  },
  disabled: { opacity: 0.4 },
  danger: { backgroundColor: c.danger },
  primary: { backgroundColor: c.blue },
  secondary: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderWidth: 1,
  },
  ghost: { backgroundColor: "transparent" },
  success: { backgroundColor: c.success },
});

export type EmployeeButtonVariant =
  "danger" | "ghost" | "primary" | "secondary" | "success";
export type EmployeeButtonSize = keyof typeof employeeButtonHeights;

const labelColors = {
  danger: c.white,
  ghost: c.blue,
  primary: c.white,
  secondary: c.navy,
  success: c.white,
} satisfies Record<EmployeeButtonVariant, string>;
const pressedColors: Partial<Record<EmployeeButtonVariant, string>> = {
  ghost: c.ice,
  primary: employeeFeedbackColors.primaryPressed,
  secondary: employeeFeedbackColors.secondaryPressed,
};

export function EmployeeButton({
  label,
  onPress,
  variant = "primary",
  size = variant === "primary" || variant === "danger" || variant === "success"
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
  readonly variant?: EmployeeButtonVariant;
  readonly size?: EmployeeButtonSize;
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
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={role}
      accessibilityState={{
        ...accessibilityState,
        ...(busy ? { busy: true } : {}),
        disabled: isDisabled,
      }}
      disabled={isDisabled}
      hitSlop={{
        bottom: hitExtension,
        left: 0,
        right: 0,
        top: hitExtension,
      }}
      onPress={() => {
        if (!isDisabled) onPress();
      }}
      style={({ pressed }) => [
        employeeControlStyles.button,
        employeeControlStyles[variant],
        { height },
        pressed && !isDisabled && { transform: [{ scale: 0.98 }] },
        pressed &&
          !isDisabled &&
          pressedColors[variant] !== undefined && {
            backgroundColor: pressedColors[variant],
          },
        pressed &&
          !isDisabled &&
          (variant === "danger" || variant === "success") && { opacity: 0.9 },
        isDisabled && employeeControlStyles.disabled,
      ]}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          flexShrink: 1,
          gap: employeeSpacing.compact,
          justifyContent: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator
            accessible={false}
            color={
              variant === "primary" ||
              variant === "danger" ||
              variant === "success"
                ? c.white
                : c.blue
            }
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
  );
}
