import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Pressable, Text, View } from "react-native";

import { EmployeeBackIcon } from "./employee-icons";
import {
  employeeMinimumTouchTarget,
  employeeSpacing as space,
} from "./employee-tokens";
import { employeeTypography as type } from "./employee-typography";

export const employeeBackHeaderStylesTheme = createEmployeeStyles((p) => ({
  header: {
    alignItems: "center",
    backgroundColor: p.appBackground,
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    flexDirection: "row",
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
    color: p.textPrimary,
    flex: 1,
    flexShrink: 1,
  },
}));
export const employeeBackHeaderStyles = employeeBackHeaderStylesTheme.light;

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
  const employeeBackHeaderStyles = useEmployeeStyles(
    employeeBackHeaderStylesTheme,
  );

  return (
    <View style={employeeBackHeaderStyles.header}>
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
