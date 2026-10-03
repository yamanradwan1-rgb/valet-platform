import {
  createEmployeeStyles,
  createEmployeeValues,
} from "../appearance/employee-themed-styles";
import {
  useEmployeeStyles,
  useEmployeePalette,
} from "../appearance/employee-appearance-context";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type AccessibilityRole,
  type AccessibilityState,
} from "react-native";
import type { ReactNode } from "react";

import {
  employeeButtonHeights,
  employeeMinimumTouchTarget,
  employeeRadius,
  employeeSpacing,
} from "./employee-tokens";
import { employeeTypography } from "./employee-typography";

export const employeeControlStylesTheme = createEmployeeStyles((p) => ({
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
  danger: { backgroundColor: p.actionDanger },
  muted: { backgroundColor: "transparent" },
  navy: { backgroundColor: p.inverseSurface },
  primary: { backgroundColor: p.actionPrimary },
  secondary: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
  },
  ghost: { backgroundColor: "transparent" },
  success: { backgroundColor: p.actionSuccess },
}));
export const employeeControlStyles = employeeControlStylesTheme.light;

export type EmployeeButtonVariant =
  "danger" | "ghost" | "muted" | "navy" | "primary" | "secondary" | "success";
export type EmployeeButtonSize = keyof typeof employeeButtonHeights;

const labelColorsTheme = createEmployeeValues(
  (p) =>
    ({
      danger: p.onAction,
      ghost: p.linkPrimary,
      muted: p.textMuted,
      navy: p.onAction,
      primary: p.onAction,
      secondary: p.textPrimary,
      success: p.onAction,
    }) satisfies Record<EmployeeButtonVariant, string>,
);
const pressedColorsTheme = createEmployeeValues<
  Partial<Record<EmployeeButtonVariant, string>>
>(
  (p) =>
    ({
      ghost: p.selectedSurface,
      navy: p.inverseRaised,
      primary: p.primaryPressed,
      secondary: p.secondaryPressed,
    }) satisfies Partial<Record<EmployeeButtonVariant, string>>,
);

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
  height: heightOverride,
  leading,
  radius,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: EmployeeButtonVariant;
  readonly size?: EmployeeButtonSize;
  readonly disabled?: boolean;
  readonly role?: AccessibilityRole;
  readonly accessibilityState?: AccessibilityState;
  readonly busy?: boolean;
  readonly height?: number | undefined;
  readonly leading?: ReactNode;
  readonly radius?: number | undefined;
}) {
  const p = useEmployeePalette();
  const employeeControlStyles = useEmployeeStyles(employeeControlStylesTheme);
  const labelColors = useEmployeeStyles(labelColorsTheme);
  const pressedColors = useEmployeeStyles(pressedColorsTheme);

  const height = heightOverride ?? employeeButtonHeights[size];
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
        { borderRadius: radius ?? employeeRadius.primary, height },
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
              variant === "navy" ||
              variant === "danger" ||
              variant === "success"
                ? p.onAction
                : p.linkPrimary
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
