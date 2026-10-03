import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Text, View } from "react-native";

import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import type { EmployeeConnectivityStatus } from "@valet/employee-client";

export function NativeConnectivityBanner({
  locale,
  status,
}: {
  readonly locale: FoundationLocale;
  readonly status: EmployeeConnectivityStatus;
}) {
  const styles = useEmployeeStyles(nativeConnectivityBannerStylesTheme);

  if (status !== "offline") return null;
  const textAlign = locale === "ar" ? "right" : "left";
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.banner}
      testID="native-offline-banner"
    >
      <Text style={[styles.text, employeeTextStyle("human", textAlign)]}>
        {getNativeEmployeeDictionary(locale).noNetworkMessage}
      </Text>
    </View>
  );
}

export const nativeConnectivityBannerStylesTheme = createEmployeeStyles(
  (p) => ({
    banner: {
      backgroundColor: p.actionDanger,
      paddingHorizontal: 16,
      paddingVertical: 8,
      width: "100%",
    },
    text: {
      ...type.small,
      color: p.onAction,
      fontWeight: "600",
      textAlign: "center",
    },
  }),
);
export const nativeConnectivityBannerStyles =
  nativeConnectivityBannerStylesTheme.light;
