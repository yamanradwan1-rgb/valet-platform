import { Text, View } from "react-native";

import { useEmployeePalette } from "../appearance/employee-appearance-context";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeCard } from "../employee-ui/employee-feedback";
import { employeeSpacing } from "../employee-ui/employee-tokens";
import { employeeTextStyle, employeeTypography } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { nativeBatteryCopy } from "./native-battery-copy";
import type { BatteryOptimizationStatus } from "./native-battery-status";

export function NativeBatteryNotice({
  locale,
  onOpenSettings,
  status,
}: {
  readonly locale: FoundationLocale;
  readonly onOpenSettings: () => void;
  readonly status: BatteryOptimizationStatus;
}) {
  const palette = useEmployeePalette();
  if (status !== "restricted") return null;

  const copy = nativeBatteryCopy[locale];
  const textAlign = locale === "ar" ? "right" : "left";
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{ marginHorizontal: employeeSpacing.lg, marginTop: employeeSpacing.sm }}
      testID="native-battery-warning"
    >
      <EmployeeCard>
        <Text style={[employeeTypography.body, { color: palette.textPrimary, fontWeight: "700" }, employeeTextStyle("human", textAlign)]}>
          {copy.title}
        </Text>
        <Text style={[employeeTypography.body, { color: palette.textPrimary }, employeeTextStyle("human", textAlign)]}>
          {copy.detail}
        </Text>
        <EmployeeButton
          label={copy.action}
          onPress={onOpenSettings}
          size="standard"
          variant="secondary"
        />
      </EmployeeCard>
    </View>
  );
}
