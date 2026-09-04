import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
import { NativePocPanel } from "../auth/native-poc-panel";
import {
  createNativeEmployeeRuntime,
  type NativeEmployeeRuntime,
} from "../auth/native-auth-runtime";
import { NativeTasksPanel } from "../tasks/native-tasks-panel";
import { NativeQrPanel } from "../scanner/native-qr-panel";
import { NativeCheckInPanel } from "../check-in/native-check-in-panel";
import {
  FOUNDATION_LOCALES,
  type FoundationLocale,
  getFoundationPresentation,
} from "./foundation-locale";
import { styles } from "./foundation-styles";

interface AuthBootstrap {
  readonly operationalSnapshot: EmployeeOperationalSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
  readonly snapshot: NativeAuthSnapshot;
}

function createAuthBootstrap(): AuthBootstrap {
  try {
    const runtime = createNativeEmployeeRuntime();
    return {
      operationalSnapshot: runtime.operations.current(),
      runtime,
      snapshot: runtime.auth.current(),
    };
  } catch {
    return {
      operationalSnapshot: {
        contextFailure: null,
        identityGeneration: null,
        mutation: { phase: "idle" },
        phase: "inactive",
        queueFailure: null,
        queueLoading: false,
        scope: null,
        tasks: [],
      },
      runtime: undefined,
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
  const [operationalSnapshot, setOperationalSnapshot] = useState(
    auth.operationalSnapshot,
  );
  const presentation = getFoundationPresentation(locale);

  useEffect(() => {
    if (auth.runtime === undefined) return;
    const unsubscribeAuth = auth.runtime.auth.subscribe(setSnapshot);
    const unsubscribeOperations = auth.runtime.operations.subscribe(
      setOperationalSnapshot,
    );
    void auth.runtime.auth.start();
    return () => {
      unsubscribeAuth();
      unsubscribeOperations();
      auth.runtime?.dispose();
    };
  }, [auth]);

  useEffect(() => {
    if (auth.runtime === undefined) return;
    if (snapshot.phase === "authenticated") {
      void auth.runtime.operations.activate(snapshot.authGeneration);
    } else {
      auth.runtime.operations.clear();
    }
  }, [auth, snapshot.authGeneration, snapshot.phase]);

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
          session={auth.runtime?.auth}
          snapshot={snapshot}
          textAlign={presentation.textAlign}
        />

        {__DEV__ ? (
          <NativePocPanel apiOrigin={auth.runtime?.apiOrigin} auth={snapshot} />
        ) : null}

        {snapshot.phase === "authenticated" && auth.runtime !== undefined ? (
          <NativeQrPanel
            key={snapshot.authGeneration}
            auth={auth.runtime.auth}
            locale={locale}
          />
        ) : null}

        {snapshot.phase === "authenticated" && auth.runtime !== undefined ? (
          <NativeCheckInPanel
            key={`${snapshot.authGeneration}:${operationalSnapshot.scope?.membershipId}:${operationalSnapshot.scope?.locationId}:${operationalSnapshot.scope?.shiftId}`}
            checkIn={auth.runtime.checkIn}
            locale={locale}
            operations={operationalSnapshot}
          />
        ) : null}

        {snapshot.phase === "authenticated" && auth.runtime !== undefined ? (
          <NativeTasksPanel
            locale={locale}
            operations={auth.runtime.operations}
            snapshot={operationalSnapshot}
            textAlign={presentation.textAlign}
          />
        ) : null}

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
