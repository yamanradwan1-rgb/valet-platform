import { View } from "react-native";

import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";
import { getFoundationPresentation } from "../foundation/foundation-locale";
import { NativeActiveShiftPanel } from "../shift/native-active-shift-panel";
import { NativeRetrievalAttention } from "../tasks/native-retrieval-attention";
import { NativeTasksPanel } from "../tasks/native-tasks-panel";
import { NativeNewVehicleButton } from "../tasks/native-new-vehicle-button";
import { executeNativeTaskAction } from "../tasks/native-task-action-sequence";
import { getNativeTasksCopy } from "../tasks/native-tasks-copy";
import { NativeVehiclesRoute } from "../vehicles/native-vehicles-route";
import { NativeScanHubScreen } from "../scan/native-scan-hub-screen";
import { deriveNativeScanHubGates } from "../scan/native-scan-hub-gates";
import { NativeCheckInRoute } from "./native-check-in-route";
import { NativeParkingStartPanel } from "../parking/native-parking-start-panel";
import { launchCompletedCheckInParking } from "../parking/native-completed-check-in-parking";
import { NativeParkingRoute } from "../parking/native-parking-route";
import { NativeRetrievalPanel } from "../retrieval/native-retrieval-panel";
import { NativeHandoffPanel } from "../handoff/native-handoff-panel";
import { NativeReleasePanel } from "../handoff/native-release-panel";
import { shouldShowNativeHandoff } from "../handoff/native-handoff-route-presentation";
import { NativeActiveHeaderUtilities } from "./native-active-header-utilities";
import { NativeProductionNavigation } from "./native-production-navigation";
import { getNativeShellCopy } from "./native-shell-copy";
import {
  closeRetrieval,
  openHandoff,
} from "./native-production-workflow-navigation";
import { NativeContextualSurface } from "./native-contextual-surface";
import { nativeContextualNavigationPinned } from "./native-contextual-route";
import { NativeConnectivityBanner } from "./native-connectivity-banner";
import type { NativeProductionWorkspaceProps } from "./native-production-workspace-types";
import { nativeIncidentRecoveryVisible } from "../incident/native-incident-types";
import { NativeTaskTrackingStatus } from "../tracking/native-task-tracking-status";

export function NativeProductionWorkspace({
  authSnapshot,
  confirmParking,
  connectivity,
  contextual,
  handoff,
  locale,
  navigate,
  onSelectLocale,
  operations,
  parking,
  push,
  retrieval,
  release,
  retrievalAttention,
  runtime,
  shell,
  vehicleDirectory,
}: NativeProductionWorkspaceProps) {
  const presentation = getFoundationPresentation(locale);
  const copy = getNativeShellCopy(locale);
  const taskCopy = getNativeTasksCopy(locale);
  const shiftEnd = runtime.shiftEnd.current();

  return (
    <EmployeeFrame direction={presentation.direction}>
      <NativeConnectivityBanner locale={locale} status={connectivity} />
      <NativeTaskTrackingStatus locale={locale} runtime={runtime.taskTracking} />
      <EmployeeAppHeader
        scope={shell.scope}
        textAlign={presentation.textAlign}
        utilities={
          <NativeActiveHeaderUtilities
            locale={locale}
            onRequestNotificationPermission={push.requestPermission}
            onSelectLocale={onSelectLocale}
            pushSnapshot={push.snapshot}
            scope={shell.scope}
          />
        }
      />
      <NativeRetrievalAttention
        locale={locale}
        onDismiss={retrievalAttention.dismiss}
        onOpenQueue={retrievalAttention.openCurrentTaskQueue}
        attention={retrievalAttention.attention}
        textAlign={presentation.textAlign}
      />
      <View style={{ flex: 1, minHeight: 0 }} testID="native-production-shell">
        {contextual.route !== null ||
        nativeIncidentRecoveryVisible(contextual.incident) ? (
          <NativeContextualSurface
            connectivity={connectivity}
            guestAccess={contextual.guestAccess}
            incident={contextual.incident}
            locale={locale}
            onClose={contextual.close}
            route={contextual.route}
            runtime={runtime}
          />
        ) : shell.destination === "check-in" ? (
          <NativeCheckInRoute
            auth={runtime.auth}
            checkIn={runtime.checkIn}
            identityGeneration={authSnapshot.authGeneration}
            key={`${authSnapshot.authGeneration}:${shell.scope.membershipId}:${shell.scope.locationId}:${shell.scope.shiftId}`}
            locale={locale}
            onClose={() => navigate(runtime.checkInActions.returnDestination())}
            onOpenParking={(sessionId) =>
              launchCompletedCheckInParking({
                clearCheckIn: () => runtime.checkIn.clear(),
                identityGeneration: authSnapshot.authGeneration,
                navigateParking: () => navigate("parking"),
                operations: runtime.operations,
                parking: runtime.parking,
                scope: shell.scope,
                sessionId,
              })
            }
            onOpenGuestAccess={(sessionId) =>
              contextual.open("guest-access", "CHECK_IN", sessionId)
            }
            scope={shell.scope}
          />
        ) : shell.destination === "parking" ? (
          parking.phase === "started" ? (
            <NativeParkingRoute
              auth={runtime.auth}
              confirmation={runtime.confirmParking}
              confirmSnapshot={confirmParking}
              connectivity={connectivity}
              locale={locale}
              onDone={() => {
                runtime.confirmParking.clear();
                runtime.parking.clear();
                void runtime.operations.refreshQueue();
                navigate("tasks");
              }}
              onReportIssue={(sessionId) =>
                contextual.open("incident", "PARKING", sessionId)
              }
              parkingSnapshot={parking}
            />
          ) : (
            <NativeParkingStartPanel
              cancellation={runtime.parkingCancellation}
              onCancelled={() => navigate("tasks")}
              locale={locale}
              onBack={() => {
                runtime.parkingCancellation.clear();
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
            onReviewTasks={() => navigate("tasks")}
            session={runtime.shiftEnd}
            snapshot={shiftEnd}
            textAlign={presentation.textAlign}
          />
        ) : shell.destination === "vehicles" ? (
          <NativeVehiclesRoute
            runtime={runtime}
            onContinue={() => navigate("check-in")}
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
                onReportIssue={(sessionId) =>
                  contextual.open("incident", "HANDOFF", sessionId)
                }
                release={runtime.release}
                snapshot={release}
              />
            ) : (
              <NativeHandoffPanel
                auth={runtime.auth}
                handoff={runtime.handoff}
                locale={locale}
                onBack={() => closeRetrieval(runtime, navigate)}
                onReportIssue={(sessionId) =>
                  contextual.open("incident", "HANDOFF", sessionId)
                }
                snapshot={handoff}
              />
            )
          ) : (
            <NativeRetrievalPanel
              auth={runtime.auth}
              locale={locale}
              onBack={() => closeRetrieval(runtime, navigate)}
              onReportIssue={(sessionId) =>
                contextual.open("incident", "RETRIEVAL", sessionId)
              }
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
          nativeContextualNavigationPinned(contextual.route) ||
          shell.destination === "check-in" ||
          shell.destination === "parking" ||
          shell.destination === "retrieval" ||
          (shell.destination === "shift" && shiftEnd.phase === "submitting")
        }
      />
    </EmployeeFrame>
  );
}
