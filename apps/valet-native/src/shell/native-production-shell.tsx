import { useEffect, useState } from "react";
import type {
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import {
  AppState,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createNativeEmployeeRuntime,
  type NativeEmployeeRuntime,
} from "../auth/native-auth-runtime";
import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
import { checkInBackBlocked } from "../check-in/native-check-in-presentation";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";
import { EmployeePlusIcon } from "../employee-ui/employee-icons";
import {
  employeeColors as c,
  employeeMinimumTouchTarget,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";
import {
  type FoundationLocale,
  getFoundationPresentation,
} from "../foundation/foundation-locale";
import { NativeTasksPanel } from "../tasks/native-tasks-panel";
import { NativeCheckInRoute } from "./native-check-in-route";
import { NativeProductionNavigation } from "./native-production-navigation";
import { NativeShellGate } from "./native-shell-gate";
import { getNativeShellCopy } from "./native-shell-copy";
import {
  ProductionShellController,
  type ProductionDestination,
  type ProductionRouteIntent,
} from "./production-shell-controller";

interface Bootstrap {
  readonly auth: NativeAuthSnapshot;
  readonly operations: EmployeeOperationalSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
}

function createBootstrap(): Bootstrap {
  try {
    const runtime = createNativeEmployeeRuntime();
    return {
      auth: runtime.auth.current(),
      operations: runtime.operations.current(),
      runtime,
    };
  } catch {
    return {
      auth: {
        authGeneration: 0,
        phase: "fatal",
        reason: "configuration-failure",
      },
      operations: {
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
    };
  }
}

export function NativeProductionShell({
  coldIntent = null,
}: {
  readonly coldIntent?: ProductionRouteIntent | null;
}) {
  const [locale, setLocale] = useState<FoundationLocale>("en");
  const [bootstrap] = useState(createBootstrap);
  const [authSnapshot, setAuthSnapshot] = useState(bootstrap.auth);
  const [operations, setOperations] = useState(bootstrap.operations);
  const [controller] = useState(() => {
    const productionController = new ProductionShellController();
    if (coldIntent !== null) productionController.receive(coldIntent);
    return productionController;
  });
  const [, setNavigationRevision] = useState(0);
  const runtime = bootstrap.runtime;
  const shell = controller.update(authSnapshot, operations);
  const presentation = getFoundationPresentation(locale);
  const copy = getNativeShellCopy(locale);

  useEffect(() => {
    if (runtime === undefined) return;
    const unsubscribeAuth = runtime.auth.subscribe(setAuthSnapshot);
    const unsubscribeOperations = runtime.operations.subscribe(setOperations);
    void runtime.auth.start();
    return () => {
      unsubscribeAuth();
      unsubscribeOperations();
      runtime.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    if (runtime === undefined) return;
    if (authSnapshot.phase === "authenticated") {
      void runtime.operations.activate(authSnapshot.authGeneration);
    } else {
      runtime.operations.clear();
    }
  }, [authSnapshot.authGeneration, authSnapshot.phase, runtime]);

  useEffect(() => {
    if (runtime === undefined) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        runtime.auth.current().phase === "authenticated"
      ) {
        void runtime.operations.refresh();
      }
    });
    return () => subscription.remove();
  }, [runtime]);

  const navigate = (destination: ProductionDestination) => {
    controller.receive({ destination, source: "navigation" });
    setNavigationRevision((value) => value + 1);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (shell.kind !== "active" || shell.destination === "tasks")
          return false;
        if (
          runtime !== undefined &&
          shell.destination === "check-in" &&
          checkInBackBlocked(runtime.checkIn.current().phase)
        ) {
          return true;
        }
        runtime?.checkIn.clear();
        const handled = controller.back();
        if (handled) setNavigationRevision((value) => value + 1);
        return handled;
      },
    );
    return () => subscription.remove();
  }, [controller, runtime, shell]);

  if (shell.kind !== "active" || runtime === undefined) {
    return (
      <NativeShellGate
        auth={runtime?.auth}
        authSnapshot={authSnapshot}
        locale={locale}
        onRetryContext={() => void runtime?.operations.refresh()}
        onSelectLocale={setLocale}
        onSignOut={() => void runtime?.auth.logout()}
        state={shell.kind === "active" ? { kind: "auth-error" } : shell}
      />
    );
  }

  return (
    <EmployeeFrame direction={presentation.direction}>
      <EmployeeAppHeader
        scope={shell.scope}
        textAlign={presentation.textAlign}
        utilities={
          <>
            <LocaleButton
              code={locale === "en" ? "AR" : "EN"}
              label={locale === "en" ? copy.arabic : copy.english}
              onPress={() => setLocale(locale === "en" ? "ar" : "en")}
            />
            <NativeAuthPanel
              compact
              copy={getNativeAuthCopy(locale)}
              session={runtime.auth}
              snapshot={authSnapshot}
              textAlign={presentation.textAlign}
            />
          </>
        }
      />
      <View style={styles.content} testID="native-production-shell">
        {shell.destination === "check-in" ? (
          <NativeCheckInRoute
            auth={runtime.auth}
            checkIn={runtime.checkIn}
            identityGeneration={authSnapshot.authGeneration}
            key={`${authSnapshot.authGeneration}:${shell.scope.membershipId}:${shell.scope.locationId}:${shell.scope.shiftId}`}
            locale={locale}
            onClose={() => navigate("tasks")}
            scope={shell.scope}
          />
        ) : (
          <View style={styles.tasks}>
            <NativeTasksPanel
              heading={copy.tasks}
              headerAction={
                <EmployeeButton
                  label={copy.checkIn}
                  leading={<EmployeePlusIcon />}
                  onPress={() => navigate("check-in")}
                  size="compact"
                />
              }
              locale={locale}
              operations={runtime.operations}
              snapshot={operations}
              textAlign={presentation.textAlign}
            />
          </View>
        )}
      </View>
      <NativeProductionNavigation
        locale={locale}
        onNavigate={navigate}
        pinned={shell.destination === "check-in"}
      />
    </EmployeeFrame>
  );
}

function LocaleButton({
  code,
  label,
  onPress,
}: {
  readonly code: "AR" | "EN";
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.localeButton}
    >
      <Text style={styles.localeLabel}>{code}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minHeight: 0 },
  localeButton: {
    alignItems: "center",
    backgroundColor: c.ice,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: employeeMinimumTouchTarget,
    minWidth: employeeMinimumTouchTarget,
  },
  localeLabel: { ...type.small, color: c.neutral, fontWeight: "600" },
  tasks: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: space.screen,
    paddingVertical: space.lg,
  },
});
