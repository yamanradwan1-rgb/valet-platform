import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
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
  type FoundationLocale,
  getFoundationPresentation,
} from "./foundation-locale";
import { styles } from "./foundation-styles";
import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";

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
        activeShiftCount: null,
        contextFailure: null,
        identityGeneration: null,
        mutation: { phase: "idle" },
        phase: "inactive",
        queueFailure: null,
        queueHardStopped: false,
        queueLoading: false,
        queueRefreshing: false,
        successfulQueueSnapshotCount: 0,
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
  const alternateLocale: FoundationLocale = locale === "en" ? "ar" : "en";

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

  useEffect(() => {
    if (auth.runtime === undefined) return;
    void auth.runtime.operations.setForeground(
      AppState.currentState === "active",
    );
    const subscription = AppState.addEventListener("change", (state) => {
      void auth.runtime?.operations.setForeground(state === "active");
    });
    return () => {
      subscription.remove();
      void auth.runtime?.operations.setForeground(false);
    };
  }, [auth]);

  return (
    <EmployeeFrame direction={presentation.direction}>
      <EmployeeAppHeader
        scope={operationalSnapshot.scope}
        textAlign={presentation.textAlign}
        utilities={
          <>
            <LocaleButton
              accessibilityLabel={`${presentation.copy.chooseLanguage}: ${
                alternateLocale === "en"
                  ? presentation.copy.english
                  : presentation.copy.arabic
              }`}
              locale={alternateLocale}
              onSelect={setLocale}
            />
            {snapshot.phase === "authenticated" ? (
              <NativeAuthPanel
                compact
                copy={getNativeAuthCopy(locale)}
                session={auth.runtime?.auth}
                snapshot={snapshot}
                textAlign={presentation.textAlign}
              />
            ) : null}
          </>
        }
      />
      <View
        style={[styles.screen, { direction: presentation.direction }]}
        testID="foundation-shell"
      >
        {snapshot.phase !== "authenticated" ? (
          <NativeAuthPanel
            copy={getNativeAuthCopy(locale)}
            session={auth.runtime?.auth}
            snapshot={snapshot}
            textAlign={presentation.textAlign}
          />
        ) : null}

        {snapshot.phase === "authenticated" && auth.runtime !== undefined ? (
          <NativeTasksPanel
            heading={presentation.copy.tasks}
            headerAction={
              <NativeCheckInPanel
                auth={auth.runtime.auth}
                key={`${snapshot.authGeneration}:${operationalSnapshot.scope?.membershipId}:${operationalSnapshot.scope?.locationId}:${operationalSnapshot.scope?.shiftId}`}
                checkIn={auth.runtime.checkIn}
                locale={locale}
                operations={operationalSnapshot}
              />
            }
            locale={locale}
            operations={auth.runtime.operations}
            snapshot={operationalSnapshot}
            textAlign={presentation.textAlign}
          />
        ) : null}

        {snapshot.phase === "authenticated" && auth.runtime !== undefined ? (
          <NativeQrPanel
            key={snapshot.authGeneration}
            auth={auth.runtime.auth}
            locale={locale}
          />
        ) : null}

        {__DEV__ ? (
          <NativePocPanel apiOrigin={auth.runtime?.apiOrigin} auth={snapshot} />
        ) : null}
      </View>
    </EmployeeFrame>
  );
}

interface LocaleButtonProps {
  readonly accessibilityLabel: string;
  readonly locale: FoundationLocale;
  readonly onSelect: (locale: FoundationLocale) => void;
}

function LocaleButton({
  accessibilityLabel,
  locale,
  onSelect,
}: LocaleButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => onSelect(locale)}
      style={styles.localeButton}
    >
      <Text style={styles.localeLabel}>{locale.toUpperCase()}</Text>
    </Pressable>
  );
}
