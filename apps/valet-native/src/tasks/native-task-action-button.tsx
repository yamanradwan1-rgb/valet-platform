import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
} from "react-native";

import {
  employeeColors as c,
  employeeMinimumTouchTarget,
  employeeRadius,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

type NativeTaskActionVariant = "danger" | "primary" | "success";

const disabledBackground = "#D1D5DB";
const disabledText = "#4B5563";

export const nativeTaskActionButtonStyles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: employeeRadius.form,
    height: 40,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  danger: { backgroundColor: c.danger },
  compactButton: { height: 36, paddingHorizontal: 12 },
  compactLabel: { ...type.small, fontWeight: "700" },
  disabled: { backgroundColor: disabledBackground },
  label: { ...type.body, color: c.white, fontWeight: "700" },
  labelDisabled: { color: disabledText },
  primary: { backgroundColor: c.blue },
  success: { backgroundColor: c.success },
});

export function NativeTaskActionButton({
  busy,
  disabled,
  label,
  onPress,
  size = "priority",
  variant,
}: {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly size?: "compact" | "priority";
  readonly variant: NativeTaskActionVariant;
}) {
  const isDisabled = disabled || busy;
  const visibleHeight = size === "compact" ? 36 : 40;
  const hitExtension = Math.max(
    0,
    (employeeMinimumTouchTarget - visibleHeight) / 2,
  );
  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPress();
  };
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={{
        bottom: hitExtension,
        left: 0,
        right: 0,
        top: hitExtension,
      }}
      onPress={handlePress}
      style={({ pressed }) => [
        nativeTaskActionButtonStyles.button,
        size === "compact" && nativeTaskActionButtonStyles.compactButton,
        nativeTaskActionButtonStyles[variant],
        isDisabled && nativeTaskActionButtonStyles.disabled,
        pressed && !isDisabled && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {busy ? (
        <ActivityIndicator accessible={false} color={c.white} size="small" />
      ) : (
        <Text
          style={[
            nativeTaskActionButtonStyles.label,
            size === "compact" && nativeTaskActionButtonStyles.compactLabel,
            isDisabled && nativeTaskActionButtonStyles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
