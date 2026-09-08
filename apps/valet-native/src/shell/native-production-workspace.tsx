import type {
  EmployeeOperationalSnapshot,
  EmployeeParkingStartSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
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
  getFoundationPresentation,
  type FoundationLocale,
} from "../foundation/foundation-locale";
import { NativeActiveShiftPanel } from "../shift/native-active-shift-panel";
import { NativeRetrievalAttention } from "../tasks/native-retrieval-attention";
import { NativeTasksPanel } from "../tasks/native-tasks-panel";
import { NativeCheckInRoute } from "./native-check-in-route";
import { NativeParkingStartPanel } from "../parking/native-parking-start-panel";
import { NativeProductionNavigation } from "./native-production-navigation";
import { getNativeShellCopy } from "./native-shell-copy";
import type {
  ProductionDestination,
  ProductionShellState,
} from "./production-shell-controller";

type ActiveShell = Extract<ProductionShellState, { readonly kind: "active" }>;

export function NativeProductionWorkspace({
  authSnapshot,
  locale,
  navigate,
  onSelectLocale,
  operations,
  parking,
  retrievalAttention,
  runtime,
  shell,
}: {
  readonly authSnapshot: NativeAuthSnapshot;
  readonly locale: FoundationLocale;
  readonly navigate: (destination: ProductionDestination) => void;
  readonly onSelectLocale: (locale: FoundationLocale) => void;
  readonly operations: EmployeeOperationalSnapshot;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly retrievalAttention: {
    readonly dismiss: (taskId: string) => void;
    readonly taskIds: readonly string[];
  };
  readonly runtime: NativeEmployeeRuntime;
  readonly shell: ActiveShell;
}) {
  const presentation = getFoundationPresentation(locale);
  const copy = getNativeShellCopy(locale);

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
              onPress={() => onSelectLocale(locale === "en" ? "ar" : "en")}
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
        <NativeRetrievalAttention
          locale={locale}
          onDismiss={retrievalAttention.dismiss}
          onOpenQueue={() => navigate("tasks")}
          operations={runtime.operations}
          taskIds={retrievalAttention.taskIds}
          textAlign={presentation.textAlign}
        />
        {shell.destination === "check-in" ? (
          <NativeCheckInRoute
            auth={runtime.auth}
            checkIn={runtime.checkIn}
            identityGeneration={authSnapshot.authGeneration}
            key={`${authSnapshot.authGeneration}:${shell.scope.membershipId}:${shell.scope.locationId}:${shell.scope.shiftId}`}
            locale={locale}
            onClose={() => navigate("tasks")}
            onOpenParking={(sessionId) => {
              runtime.checkIn.clear();
              void runtime.parking.openCompletedCheckIn(
                authSnapshot.authGeneration,
                shell.scope,
                sessionId,
              );
              navigate("parking");
            }}
            scope={shell.scope}
          />
        ) : shell.destination === "parking" ? (
          <NativeParkingStartPanel
            locale={locale}
            onBack={() => {
              runtime.parking.clear();
              void runtime.operations.refreshQueue();
              navigate("tasks");
            }}
            operations={runtime.operations}
            parking={runtime.parking}
            snapshot={parking}
          />
        ) : shell.destination === "shift" ? (
          <NativeActiveShiftPanel
            locale={locale}
            scope={shell.scope}
            textAlign={presentation.textAlign}
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
              onOpenParking={(taskId, sessionId) => {
                void runtime.parking.openQueueTask(
                  authSnapshot.authGeneration,
                  shell.scope,
                  taskId,
                  sessionId,
                );
                navigate("parking");
              }}
              snapshot={operations}
              textAlign={presentation.textAlign}
            />
          </View>
        )}
      </View>
      <NativeProductionNavigation
        activeDestination={shell.destination}
        locale={locale}
        onNavigate={navigate}
        pinned={
          shell.destination === "check-in" || shell.destination === "parking"
        }
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
  content: { flex: 1, minHeight: 0, position: "relative" },
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
