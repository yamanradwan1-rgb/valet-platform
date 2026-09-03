import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
import { createNativeAuthSession } from "../auth/native-auth-runtime";
import {
  FOUNDATION_LOCALES,
  type FoundationLocale,
  getFoundationPresentation,
} from "./foundation-locale";
import { styles } from "./foundation-styles";

interface AuthBootstrap {
  readonly session: NativeAuthSession | undefined;
  readonly snapshot: NativeAuthSnapshot;
}

function createAuthBootstrap(): AuthBootstrap {
  try {
    const session = createNativeAuthSession();
    return { session, snapshot: session.current() };
  } catch {
    return {
      session: undefined,
      snapshot: {
        authGeneration: 0,
        phase: "fatal",
        reason: "configuration-failure",
      },
    };
  }
}

export function FoundationShell() {
  const [locale, setLocale] = useState<FoundationLocale>("en");
  const [auth] = useState(createAuthBootstrap);
  const [snapshot, setSnapshot] = useState(auth.snapshot);
  const presentation = getFoundationPresentation(locale);

  useEffect(() => {
    if (auth.session === undefined) return;
    const unsubscribe = auth.session.subscribe(setSnapshot);
    void auth.session.start();
    return unsubscribe;
  }, [auth]);

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

        <NativeAuthPanel
          copy={getNativeAuthCopy(locale)}
          session={auth.session}
          snapshot={snapshot}
          textAlign={presentation.textAlign}
        />

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
  readonly activeLocale: FoundationLocale;
  readonly label: string;
  readonly locale: FoundationLocale;
  readonly onSelect: (locale: FoundationLocale) => void;
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
