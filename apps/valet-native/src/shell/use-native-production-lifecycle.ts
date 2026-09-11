import { useEffect } from "react";
import { AppState } from "react-native";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { nativeOnlineHint } from "../shift/native-shift-connectivity";

export function useNativeProductionLifecycle(
  runtime: NativeEmployeeRuntime | undefined,
): void {
  useEffect(() => {
    if (runtime === undefined) return;
    void runtime.operations.setForeground(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        runtime.shiftEnd.suspendForBackground();
        runtime.release.suspendForBackground();
        runtime.handoff.suspendForBackground();
      }
      runtime.shiftEnd.setOnline(nativeOnlineHint());
      void runtime.operations.setForeground(state === "active");
      if (state !== "active") return;
      if (runtime.release.current().phase !== "inactive") {
        void runtime.release.checkServerState();
      } else if (runtime.handoff.current().phase !== "inactive") {
        void runtime.handoff.checkServerState();
      } else if (runtime.confirmParking.current().phase !== "inactive") {
        void runtime.confirmParking.checkServerState();
      } else if (runtime.parking.current().phase !== "inactive") {
        void runtime.parking.checkServerState();
      } else if (runtime.retrieval.current().phase !== "inactive") {
        void runtime.retrieval.checkServerState();
      }
    });
    return () => {
      subscription.remove();
      void runtime.operations.setForeground(false);
    };
  }, [runtime]);
}
