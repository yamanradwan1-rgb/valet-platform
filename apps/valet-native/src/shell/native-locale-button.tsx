import { Pressable, StyleSheet, Text } from "react-native";

import {
  employeeColors as c,
  employeeMinimumTouchTarget,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export function NativeLocaleButton({
  code,
  label,
  onPress,
}: {
  readonly code: "AR" | "EN";
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.button}
    >
      <Text style={styles.label}>{code}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: c.ice,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: employeeMinimumTouchTarget,
    minWidth: employeeMinimumTouchTarget,
  },
  label: { ...type.small, color: c.neutral, fontWeight: "600" },
});
