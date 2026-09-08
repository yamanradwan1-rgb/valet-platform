import { useEffect } from "react";
import { BackHandler } from "react-native";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { checkInBackBlocked } from "../check-in/native-check-in-presentation";
import { nativeParkingBackBlocked } from "../parking/native-parking-protection";
import { nativeRetrievalBackBlocked } from "../retrieval/native-retrieval-protection";
import { nativeHandoffBackBlocked } from "../handoff/native-handoff-protection";
import { nativeReleaseBackBlocked } from "../handoff/native-release-protection";
import type {
  ProductionShellController,
  ProductionShellState,
} from "./production-shell-controller";

export function useNativeProductionBackHandler(
  controller: ProductionShellController,
  runtime: NativeEmployeeRuntime | undefined,
  shell: ProductionShellState,
  onNavigation: () => void,
): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
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
        runtime?.checkIn.clear();
        const handled = controller.back();
        if (handled) onNavigation();
        return handled;
      },
    );
    return () => subscription.remove();
  }, [controller, onNavigation, runtime, shell]);
}
