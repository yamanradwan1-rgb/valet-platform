import { useEffect } from "react";
import { BackHandler } from "react-native";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { checkInBackBlocked } from "../check-in/native-check-in-presentation";
import { nativeParkingBackBlocked } from "../parking/native-parking-protection";
import { nativeRetrievalBackBlocked } from "../retrieval/native-retrieval-protection";
import { nativeHandoffBackBlocked } from "../handoff/native-handoff-protection";
import { nativeReleaseBackBlocked } from "../handoff/native-release-protection";
import { nativeShiftEndBackAction } from "../shift/native-shift-protection";
import type {
  ProductionShellController,
  ProductionShellState,
} from "./production-shell-controller";

export function useNativeProductionBackHandler(
  controller: ProductionShellController,
  runtime: NativeEmployeeRuntime | undefined,
  shell: ProductionShellState,
  onNavigation: () => void,
  onContextualBack: () => boolean,
): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (runtime?.parkingCancellation?.protected()) return true;
        if (runtime?.parkingCancellation?.current().phase === "confirming") {
          runtime.parkingCancellation.dismiss();
          return true;
        }
        if (onContextualBack()) return true;
        if (runtime !== undefined) {
          const shiftAction = nativeShiftEndBackAction(
            runtime.shiftEnd.current().phase,
          );
          if (shiftAction === "block") return true;
          if (shiftAction === "cancel-confirmation") {
            runtime.shiftEnd.cancelConfirmation();
            return true;
          }
        }
        if (shell.kind !== "active" || shell.destination === "tasks") {
          return false;
        }
        if (
          runtime !== undefined &&
          shell.destination === "check-in" &&
          checkInBackBlocked(
            runtime.checkIn.current().phase,
            runtime.checkIn.current().continuation?.mode,
          )
        ) {
          return true;
        }
        if (
          runtime !== undefined &&
          shell.destination === "parking" &&
          nativeParkingBackBlocked(
            runtime.parking.current().phase,
            runtime.confirmParking.current().phase,
          )
        ) {
          return true;
        }
        if (
          runtime !== undefined &&
          shell.destination === "retrieval" &&
          (nativeRetrievalBackBlocked(runtime.retrieval.current().phase) ||
            nativeHandoffBackBlocked(runtime.handoff.current().phase) ||
            nativeReleaseBackBlocked(runtime.release.current().phase))
        ) {
          return true;
        }
        if (runtime !== undefined && shell.destination === "parking") {
          const confirmPhase = runtime.confirmParking.current().phase;
          if (confirmPhase === "slot" || confirmPhase === "ready") {
            runtime.confirmParking.backToSpot();
            return true;
          }
          runtime.confirmParking.clear();
          runtime.parking.clear();
          runtime.parkingCancellation?.clear();
          void runtime.operations.refreshQueue();
        }
        if (runtime !== undefined && shell.destination === "retrieval") {
          runtime.handoff.clear();
          runtime.release.clear();
          runtime.retrieval.clear();
          void runtime.operations.refreshQueue();
        }
        if (
          runtime !== undefined &&
          shell.destination === "check-in" &&
          runtime.checkIn.current().phase === "created" &&
          runtime.checkIn.current().continuation?.mode !== "view"
        ) {
          runtime.checkIn.cancelVehicleEdit();
          return true;
        }
        if (runtime && shell.destination === "check-in") {
          const destination = runtime.checkInActions.returnDestination();
          runtime.checkIn.clear();
          if (destination === "vehicles") {
            controller.receive({
              destination: "vehicles",
              source: "navigation",
            });
            onNavigation();
            return true;
          }
        }
        runtime?.checkIn.clear();
        const handled = controller.back();
        if (handled) onNavigation();
        return handled;
      },
    );
    return () => subscription.remove();
  }, [controller, onContextualBack, onNavigation, runtime, shell]);
}
