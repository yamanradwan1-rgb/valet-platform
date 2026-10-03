import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Pressable, Text, View } from "react-native";

import { EmployeePlusIcon } from "../employee-ui/employee-icons";
import { employeeRadius } from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export function NativeNewVehicleButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  const s = useEmployeeStyles(nativeNewVehicleButtonStylesTheme);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.button, pressed && s.pressed]}
    >
      <View style={s.content}>
        <EmployeePlusIcon size={14} />
        <Text style={s.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

export const nativeNewVehicleButtonStylesTheme = createEmployeeStyles((p) => ({
  button: {
    alignItems: "center",
    backgroundColor: p.actionPrimary,
    borderRadius: employeeRadius.form,
    elevation: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 16,
    shadowColor: p.shadow,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  content: { alignItems: "center", flexDirection: "row", gap: 6 },
  label: { ...type.body, color: p.onAction, fontWeight: "700" },
  pressed: { transform: [{ scale: 0.98 }] },
}));
export const nativeNewVehicleButtonStyles =
  nativeNewVehicleButtonStylesTheme.light;
