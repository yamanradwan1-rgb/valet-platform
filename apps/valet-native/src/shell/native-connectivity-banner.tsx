import { StyleSheet, Text, View } from "react-native";
import { employeeColors as c } from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

/** Presentation boundary only. Production supplies no value until an approved
 * subscribed Native connectivity authority exists. */
export function NativeConnectivityBanner({
  locale,
  online,
}: {
  readonly locale: FoundationLocale;
  readonly online?: boolean | undefined;
}) {
  if (online !== false) return null;
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

export const nativeConnectivityBannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: c.danger,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: "100%",
  },
  text: {
    ...type.small,
    color: c.white,
    fontWeight: "600",
    textAlign: "center",
  },
});

const styles = nativeConnectivityBannerStyles;
