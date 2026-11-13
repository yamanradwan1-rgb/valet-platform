import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { createEmployeeStyles } from "../../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../../appearance/employee-appearance-context";
import {
  employeeButtonHeights,
  employeeRadius,
  employeeSpacing,
} from "../../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography,
} from "../../employee-ui/employee-typography";
import type { FoundationLocale } from "../../foundation/foundation-locale";
import { NativeWhatsAppPrototypeLogo } from "./native-whatsapp-prototype-logo";
import { whatsAppPrototypePalettes } from "./native-whatsapp-prototype-palette";
import {
  getWhatsAppDemoCopy,
  type WhatsAppDemoState,
} from "./native-whatsapp-prototype-state";

/** Presentation only. Its sole callback advances a local, labeled demonstration. */
export function NativeWhatsAppPrototypeButton({
  locale,
  onAdvance,
  state,
}: {
  readonly locale: FoundationLocale;
  readonly onAdvance: () => void;
  readonly state: WhatsAppDemoState;
}) {
  const styles = useEmployeeStyles(whatsAppPrototypeStyles);
  const copy = getWhatsAppDemoCopy(locale, state);
  const busy = state === "loading";
  const disabled = busy || state === "disabled";
  const color =
    state === "disabled" ? styles.disabledLabel.color : styles.label.color;
  return (
    <Pressable
      accessibilityHint={copy.hint}
      accessibilityLabel={copy.accessibilityLabel}
      accessibilityLiveRegion="polite"
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) onAdvance();
      }}
      style={({ pressed }) => [
        styles.button,
        (pressed || state === "pressed") && !disabled && styles.pressed,
        state === "disabled" && styles.disabled,
      ]}
      testID="whatsapp-prototype-button"
    >
      <View
        style={[
          styles.content,
          { flexDirection: locale === "ar" ? "row-reverse" : "row" },
        ]}
      >
        <NativeWhatsAppPrototypeLogo color={color} />
        {busy ? (
          <ActivityIndicator accessible={false} color={color} size="small" />
        ) : null}
        <Text
          style={[
            styles.label,
            employeeTextStyle(
              "human",
              locale === "ar" ? "right" : "left",
              "center",
            ),
            state === "disabled" && styles.disabledLabel,
          ]}
        >
          {copy.label}
        </Text>
      </View>
    </Pressable>
  );
}

export const whatsAppPrototypeStyles = createEmployeeStyles((p) => ({
  button: {
    alignItems: "center",
    backgroundColor: whatsAppPrototypePalettes[p.mode].background,
    borderRadius: employeeRadius.primary,
    justifyContent: "center",
    minHeight: employeeButtonHeights.large,
    paddingHorizontal: employeeSpacing.lg,
    paddingVertical: employeeSpacing.md,
  },
  content: {
    alignItems: "center",
    direction: "ltr",
    flexShrink: 1,
    gap: employeeSpacing.sm,
    justifyContent: "center",
  },
  disabled: {
    backgroundColor: whatsAppPrototypePalettes[p.mode].disabledBackground,
  },
  disabledLabel: {
    color: whatsAppPrototypePalettes[p.mode].disabledForeground,
  },
  label: {
    ...employeeTypography.button,
    color: whatsAppPrototypePalettes[p.mode].foreground,
    flexShrink: 1,
    lineHeight: 20,
  },
  pressed: { backgroundColor: whatsAppPrototypePalettes[p.mode].pressed },
}));
