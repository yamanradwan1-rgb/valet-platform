import type {
  EmployeeConfirmParkedSnapshot,
  EmployeeHandoffSnapshot,
  EmployeeOperationalSnapshot,
  EmployeeParkingStartSnapshot,
  EmployeeReleaseSnapshot,
  EmployeeRetrievalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { StyleSheet, View } from "react-native";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";
import { EmployeePlusIcon } from "../employee-ui/employee-icons";
import { employeeSpacing as space } from "../employee-ui/employee-tokens";
import {
  getFoundationPresentation,
  type FoundationLocale,
} from "../foundation/foundation-locale";
import { NativeActiveShiftPanel } from "../shift/native-active-shift-panel";
import { NativeRetrievalAttention } from "../tasks/native-retrieval-attention";
import { NativeTasksPanel } from "../tasks/native-tasks-panel";
import { NativeCheckInRoute } from "./native-check-in-route";
import { NativeParkingStartPanel } from "../parking/native-parking-start-panel";
import { NativeParkingConfirmPanel } from "../parking/native-parking-confirm-panel";
import { NativeRetrievalPanel } from "../retrieval/native-retrieval-panel";
import { NativeHandoffPanel } from "../handoff/native-handoff-panel";
import { NativeReleasePanel } from "../handoff/native-release-panel";
import { shouldShowNativeHandoff } from "../handoff/native-handoff-route-presentation";
import { NativeProductionNavigation } from "./native-production-navigation";
import { NativeLocaleButton } from "./native-locale-button";
import { getNativeShellCopy } from "./native-shell-copy";
import type {
  ProductionDestination,
  ProductionShellState,
} from "./production-shell-controller";

type ActiveShell = Extract<ProductionShellState, { readonly kind: "active" }>;

export function NativeProductionWorkspace({
  authSnapshot,
  confirmParking,
  handoff,
  locale,
  navigate,
  onSelectLocale,
  operations,
  parking,
  retrieval,
  release,
  retrievalAttention,
  runtime,
  shell,
}: {
  readonly authSnapshot: NativeAuthSnapshot;
  readonly confirmParking: EmployeeConfirmParkedSnapshot;
  readonly handoff: EmployeeHandoffSnapshot;
  readonly locale: FoundationLocale;
  readonly navigate: (destination: ProductionDestination) => void;
  readonly onSelectLocale: (locale: FoundationLocale) => void;
  readonly operations: EmployeeOperationalSnapshot;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly retrieval: EmployeeRetrievalSnapshot;
  readonly release: EmployeeReleaseSnapshot;
  readonly retrievalAttention: {
    readonly dismiss: (taskId: string) => void;
    readonly taskIds: readonly string[];
  };
  readonly runtime: NativeEmployeeRuntime;
  readonly shell: ActiveShell;
}) {
  const presentation = getFoundationPresentation(locale);
  const copy = getNativeShellCopy(locale);
  const shiftEnd = runtime.shiftEnd.current();

  return (
    <EmployeeFrame direction={presentation.direction}>
      <EmployeeAppHeader
        scope={shell.scope}
        textAlign={presentation.textAlign}
        utilities={
          <>
            <NativeLocaleButton
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
          parking.phase === "started" ? (
            <NativeParkingConfirmPanel
              auth={runtime.auth}
              confirmation={runtime.confirmParking}
              locale={locale}
              onDone={() => {
                runtime.confirmParking.clear();
                runtime.parking.clear();
                void runtime.operations.refreshQueue();
                navigate("tasks");
              }}
              snapshot={confirmParking}
            />
          ) : (
            <NativeParkingStartPanel
              locale={locale}
              onBack={() => {
                runtime.confirmParking.clear();
                runtime.parking.clear();
                void runtime.operations.refreshQueue();
                navigate("tasks");
              }}
              operations={runtime.operations}
              parking={runtime.parking}
              snapshot={parking}
            />
          )
        ) : shell.destination === "shift" ? (
          <NativeActiveShiftPanel
            locale={locale}
            onReturned={() => void runtime.operations.refresh()}
            onReviewTasks={() => navigate("tasks")}
            session={runtime.shiftEnd}
            snapshot={shiftEnd}
            textAlign={presentation.textAlign}
          />
        ) : shell.destination === "retrieval" ? (
          shouldShowNativeHandoff(handoff, retrieval, release) ? (
            release.phase !== "inactive" ? (
              <NativeReleasePanel
                locale={locale}
                onBack={() => closeRetrieval(runtime, navigate)}
                onDone={() => closeRetrieval(runtime, navigate)}
                release={runtime.release}
                snapshot={release}
              />
            ) : (
              <NativeHandoffPanel
                auth={runtime.auth}
                handoff={runtime.handoff}
                locale={locale}
                onBack={() => closeRetrieval(runtime, navigate)}
                snapshot={handoff}
              />
            )
          ) : (
            <NativeRetrievalPanel
              auth={runtime.auth}
              locale={locale}
              onBack={() => closeRetrieval(runtime, navigate)}
              retrieval={runtime.retrieval}
              snapshot={retrieval}
            />
          )
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
              onOpenRetrieval={(taskId, sessionId) => {
                const task = operations.tasks.find(
                  (item) => item.taskId === taskId,
                );
                if (task?.valetSessionState === "HANDOFF_PENDING") {
                  runtime.retrieval.clear();
                  runtime.release.clear();
                  void runtime.handoff.openTask(
                    authSnapshot.authGeneration,
                    shell.scope,
                    taskId,
                    sessionId,
                  );
                } else {
                  runtime.handoff.clear();
                  runtime.release.clear();
                  void runtime.retrieval.openQueueTask(
                    authSnapshot.authGeneration,
                    shell.scope,
                    taskId,
                    sessionId,
                  );
                }
                navigate("retrieval");
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
          shell.destination === "check-in" ||
          shell.destination === "parking" ||
          shell.destination === "retrieval" ||
          (shell.destination === "shift" && shiftEnd.phase === "submitting")
        }
      />
    </EmployeeFrame>
  );
}

function closeRetrieval(
  runtime: NativeEmployeeRuntime,
  navigate: (destination: ProductionDestination) => void,
) {
  runtime.handoff.clear();
  runtime.release.clear();
  runtime.retrieval.clear();
  void runtime.operations.refreshQueue();
  navigate("tasks");
}

const styles = StyleSheet.create({
  content: { flex: 1, minHeight: 0, position: "relative" },
  tasks: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: space.screen,
    paddingVertical: space.lg,
  },
});
