import type {
  EmployeeConfirmParkedSnapshot,
  EmployeeHandoffSnapshot,
  EmployeeOperationalSnapshot,
  EmployeeParkingStartSnapshot,
  EmployeeReleaseSnapshot,
  EmployeeRetrievalSnapshot,
  EmployeeVehicleDirectorySnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { View } from "react-native";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";
import {
  getFoundationPresentation,
  type FoundationLocale,
} from "../foundation/foundation-locale";
import { NativeActiveShiftPanel } from "../shift/native-active-shift-panel";
import { NativeRetrievalAttention } from "../tasks/native-retrieval-attention";
import { NativeTasksPanel } from "../tasks/native-tasks-panel";
import { NativeNewVehicleButton } from "../tasks/native-new-vehicle-button";
import { executeNativeTaskAction } from "../tasks/native-task-action-sequence";
import { getNativeTasksCopy } from "../tasks/native-tasks-copy";
import { NativeVehiclesScreen } from "../vehicles/native-vehicles-screen";
import { NativeScanHubScreen } from "../scan/native-scan-hub-screen";
import { deriveNativeScanHubGates } from "../scan/native-scan-hub-gates";
import { NativeCheckInRoute } from "./native-check-in-route";
import { NativeParkingStartPanel } from "../parking/native-parking-start-panel";
import { NativeParkingConfirmPanel } from "../parking/native-parking-confirm-panel";
import { NativeRetrievalPanel } from "../retrieval/native-retrieval-panel";
import { NativeHandoffPanel } from "../handoff/native-handoff-panel";
import { NativeReleasePanel } from "../handoff/native-release-panel";
import { shouldShowNativeHandoff } from "../handoff/native-handoff-route-presentation";
import { NativeActiveHeaderUtilities } from "./native-active-header-utilities";
import { NativeProductionNavigation } from "./native-production-navigation";
import { getNativeShellCopy } from "./native-shell-copy";
import type {
  ProductionDestination,
  ProductionShellState,
} from "./production-shell-controller";
import {
  closeRetrieval,
  openHandoff,
} from "./native-production-workflow-navigation";

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
  vehicleDirectory,
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
  readonly vehicleDirectory: EmployeeVehicleDirectorySnapshot;
}) {
  const presentation = getFoundationPresentation(locale);
  const copy = getNativeShellCopy(locale);
  const taskCopy = getNativeTasksCopy(locale);
  const shiftEnd = runtime.shiftEnd.current();

  return (
    <EmployeeFrame direction={presentation.direction}>
      <EmployeeAppHeader
        scope={shell.scope}
        textAlign={presentation.textAlign}
        utilities={
          <NativeActiveHeaderUtilities
            locale={locale}
            onSelectLocale={onSelectLocale}
            role={shell.scope.role}
          />
        }
      />
      <View
        style={{ flex: 1, minHeight: 0, position: "relative" }}
        testID="native-production-shell"
      >
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
            onReturned={() =>
              void runtime.operations.activate(authSnapshot.authGeneration)
            }
            onReviewTasks={() => navigate("tasks")}
            session={runtime.shiftEnd}
            snapshot={shiftEnd}
            textAlign={presentation.textAlign}
          />
        ) : shell.destination === "vehicles" ? (
          <NativeVehiclesScreen
            directory={runtime.vehicleDirectory}
            key={`${authSnapshot.authGeneration}:${shell.scope.membershipId}:${shell.scope.locationId}:${shell.scope.shiftId}`}
            locale={locale}
            scope={shell.scope}
            snapshot={vehicleDirectory}
            textAlign={presentation.textAlign}
          />
        ) : shell.destination === "scan" ? (
          <NativeScanHubScreen
            gates={deriveNativeScanHubGates({
              identityGeneration: authSnapshot.authGeneration,
              parking,
              retrieval,
              scope: shell.scope,
            })}
            locale={locale}
            navigate={navigate}
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
          <NativeTasksPanel
            heading={copy.tasks}
            headerAction={
              <NativeNewVehicleButton
                label={taskCopy.newVehicle}
                onPress={() => navigate("check-in")}
              />
            }
            locale={locale}
            operations={runtime.operations}
            onOverrideHandoff={(task) => {
              openHandoff(
                runtime,
                authSnapshot,
                shell,
                task.taskId,
                task.sessionId,
              );
              navigate("retrieval");
            }}
            onTaskAction={async (task) => {
              const result = await executeNativeTaskAction({
                identityGeneration: authSnapshot.authGeneration,
                operations: runtime.operations,
                parking: runtime.parking,
                retrieval: runtime.retrieval,
                scope: shell.scope,
                task,
              });
              if (result.kind !== "navigate") return false;
              if (
                result.destination === "retrieval" &&
                task.valetSessionState === "HANDOFF_PENDING"
              ) {
                openHandoff(
                  runtime,
                  authSnapshot,
                  shell,
                  task.taskId,
                  task.sessionId,
                );
              } else if (result.destination === "retrieval") {
                runtime.handoff.clear();
                runtime.release.clear();
              }
              navigate(result.destination);
              return true;
            }}
            snapshot={operations}
            textAlign={presentation.textAlign}
          />
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
