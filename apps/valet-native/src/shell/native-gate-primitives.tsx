import { nativeGateControlStylesTheme } from "./native-gate-style-sheets";
export {
  nativeGateStyles,
  nativeGateStylesTheme,
  nativeGateControlStyles,
  nativeGateControlStylesTheme,
} from "./native-gate-style-sheets";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { BlurView } from "expo-blur";
import { useEffect, useState, type ReactNode } from "react";
import {
  Animated,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { EmployeeLocale } from "@valet/employee-client";

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
  const styles = useEmployeeStyles(nativeGateControlStylesTheme);

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
  const styles = useEmployeeStyles(nativeGateControlStylesTheme);

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
  const styles = useEmployeeStyles(nativeGateControlStylesTheme);

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
  const styles = useEmployeeStyles(nativeGateControlStylesTheme);

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
  const styles = useEmployeeStyles(nativeGateControlStylesTheme);

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
