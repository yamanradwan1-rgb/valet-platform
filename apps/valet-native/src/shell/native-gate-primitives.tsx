import { BlurView } from "expo-blur";
import { useEffect, useState, type ReactNode } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { EmployeeLocale } from "@valet/employee-client";

import { employeeColors as c } from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeFontWeights,
} from "../employee-ui/employee-typography";

export function NativeGateCard({
  children,
  style,
  tone = "neutral",
  testID,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly tone?: "error" | "neutral";
}) {
  return (
    <View
      style={[styles.card, tone === "error" && styles.errorCard, style]}
      testID={testID}
    >
      {tone === "neutral" ? (
        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={20}
          pointerEvents="none"
          style={styles.blur}
          tint="dark"
        />
      ) : null}
      {children}
    </View>
  );
}

export function NativeGateButton({
  busy = false,
  disabled = false,
  label,
  onPress,
  size = "standard",
  variant = "primary",
}: {
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly size?: "login" | "standard";
  readonly variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary"
          ? styles.secondaryButtonHeight
          : size === "login"
            ? styles.loginButton
            : styles.standardButton,
        variant === "secondary" && styles.secondaryButton,
        pressed && !disabled && variant === "primary" && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          size === "login" && styles.loginButtonLabel,
          variant === "secondary" && styles.secondaryButtonLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function NativeGateLocaleToggle({
  locale,
  onSelectLocale,
}: {
  readonly locale: EmployeeLocale;
  readonly onSelectLocale: (locale: EmployeeLocale) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={styles.localeToggle}
      testID="native-gate-locale-toggle"
    >
      <LocaleChoice
        label="EN"
        locale="en"
        onSelectLocale={onSelectLocale}
        selected={locale === "en"}
      />
      <Text style={styles.localeUnselected}>/</Text>
      <LocaleChoice
        label="عربي"
        locale="ar"
        onSelectLocale={onSelectLocale}
        selected={locale === "ar"}
      />
    </View>
  );
}

function LocaleChoice({
  label,
  locale,
  onSelectLocale,
  selected,
}: {
  readonly label: string;
  readonly locale: EmployeeLocale;
  readonly onSelectLocale: (locale: EmployeeLocale) => void;
  readonly selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      hitSlop={12}
      onPress={() => onSelectLocale(locale)}
    >
      <Text style={selected ? styles.localeSelected : styles.localeUnselected}>
        {label}
      </Text>
    </Pressable>
  );
}

export function NativeGateSpinner({ label }: { readonly label: string }) {
  const [rotation] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        duration: 800,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [rotation]);
  return (
    <Animated.View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={[
        styles.spinner,
        {
          transform: [
            {
              rotate: rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "360deg"],
              }),
            },
          ],
        },
      ]}
      testID="native-gate-spinner"
    />
  );
}

export const nativeGateStyles = StyleSheet.create({
  actionStack: { gap: 12, width: "100%" },
  body: {
    color: c.muted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.regular,
    lineHeight: 22.75,
  },
  errorBody: { color: "#FECACACC" },
  errorTitle: { color: "#FECACA" },
  loadingLabel: {
    color: c.white,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.semiBold,
    lineHeight: 20,
  },
  loadingStack: { alignItems: "center", gap: 24 },
  title: {
    color: c.white,
    fontFamily: employeeFontFamilies.display,
    fontSize: 20,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 28,
    marginBottom: 8,
  },
});

export const nativeGateControlStyles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: c.blue,
    borderRadius: 16,
    justifyContent: "center",
    shadowColor: c.blue,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: "100%",
  },
  buttonLabel: {
    color: c.white,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 20,
  },
  blur: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  card: {
    backgroundColor: "#FFFFFF0F",
    borderColor: "#FFFFFF1A",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    padding: 24,
    width: "100%",
  },
  disabled: { opacity: 0.6 },
  errorCard: { backgroundColor: "#EF44441A", borderColor: "#F871714D" },
  localeSelected: {
    color: c.blue,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.extraBold,
    lineHeight: 16,
  },
  localeToggle: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 4,
  },
  localeUnselected: {
    color: c.muted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 16,
  },
  loginButton: { height: 56 },
  loginButtonLabel: { fontSize: 16, lineHeight: 24 },
  pressed: { transform: [{ scale: 0.98 }] },
  secondaryButton: { backgroundColor: "transparent", shadowOpacity: 0 },
  secondaryButtonHeight: { height: 44 },
  secondaryButtonLabel: {
    color: c.muted,
    fontWeight: employeeFontWeights.semiBold,
  },
  spinner: {
    borderColor: c.blue,
    borderRadius: 16,
    borderTopColor: "transparent",
    borderWidth: 4,
    height: 32,
    width: 32,
  },
  standardButton: { height: 48 },
});

const styles = nativeGateControlStyles;
