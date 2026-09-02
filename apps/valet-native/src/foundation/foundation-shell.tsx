import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FOUNDATION_LOCALES,
  type FoundationLocale,
  getFoundationPresentation,
} from "./foundation-locale";

export function FoundationShell() {
  const [locale, setLocale] = useState<FoundationLocale>("en");
  const presentation = getFoundationPresentation(locale);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        style={[styles.screen, { direction: presentation.direction }]}
        testID="foundation-shell"
      >
        <View style={styles.brandBlock}>
          <Text
            accessibilityRole="header"
            style={[styles.brand, { textAlign: presentation.textAlign }]}
          >
            {presentation.copy.appName}
          </Text>
          <Text
            style={[styles.audience, { textAlign: presentation.textAlign }]}
          >
            {presentation.copy.audience}
          </Text>
        </View>

        <Text
          accessibilityLiveRegion="polite"
          style={[styles.status, { textAlign: presentation.textAlign }]}
        >
          {presentation.copy.status}
        </Text>

        <View
          accessibilityLabel={presentation.copy.chooseLanguage}
          accessibilityRole="tablist"
          style={styles.localeControls}
        >
          {FOUNDATION_LOCALES.map((option) => (
            <LocaleButton
              key={option}
              activeLocale={locale}
              label={
                option === "en"
                  ? presentation.copy.english
                  : presentation.copy.arabic
              }
              locale={option}
              onSelect={setLocale}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

interface LocaleButtonProps {
  activeLocale: FoundationLocale;
  label: string;
  locale: FoundationLocale;
  onSelect: (locale: FoundationLocale) => void;
}

function LocaleButton({
  activeLocale,
  label,
  locale,
  onSelect,
}: LocaleButtonProps) {
  const selected = activeLocale === locale;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      hitSlop={8}
      onPress={() => onSelect(locale)}
      style={[styles.localeButton, selected && styles.localeButtonSelected]}
    >
      <Text
        style={[styles.localeLabel, selected && styles.localeLabelSelected]}
      >
        {locale.toUpperCase()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#111B31",
    flex: 1,
  },
  screen: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  brandBlock: {
    gap: 4,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: 4,
  },
  audience: {
    color: "#9FB2D8",
    fontSize: 20,
    fontWeight: "600",
  },
  status: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 38,
  },
  localeControls: {
    flexDirection: "row",
    gap: 12,
  },
  localeButton: {
    alignItems: "center",
    borderColor: "#60769F",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: 18,
  },
  localeButtonSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  localeLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  localeLabelSelected: {
    color: "#111B31",
  },
});
