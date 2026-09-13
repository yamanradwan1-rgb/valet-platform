import { useEffect, useState } from "react";
import { AppState } from "react-native";
import type {
  EmployeeConnectivityStatus,
  EmployeeTelemetryEvent,
} from "@valet/employee-client";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import { NativeProductionLifecycleOwner } from "./native-production-lifecycle-owner";

/**
 * Telemetry mapping for lifecycle/network transitions. Pure + bounded: the
 * classification IS the connectivity status (both are the same closed
 * vocabulary), so no business string can ever enter an event.
 */
function recordNetworkTransition(status: EmployeeConnectivityStatus): void {
  const event = {
    classification: status,
    outcome: status === "offline" ? "error" : "success",
    source: "network",
  } as const;
  const recorder = getNativeTelemetry();
  recorder.record(event satisfies EmployeeTelemetryEvent);
}

function recordAppStateTransition(active: boolean): void {
  getNativeTelemetry().record({
    classification: active ? "foreground" : "background",
    outcome: "success",
    source: "lifecycle",
  } as EmployeeTelemetryEvent);
}

export function useNativeProductionLifecycle(
  runtime: NativeEmployeeRuntime | undefined,
): EmployeeConnectivityStatus {
  const [connectivity, setConnectivity] =
    useState<EmployeeConnectivityStatus>("unknown");
  useEffect(() => {
    if (runtime === undefined) return;
    const owner = new NativeProductionLifecycleOwner(runtime);
    let lastStatus: EmployeeConnectivityStatus | undefined;
    const unsubscribe = runtime.connectivity.subscribe((status) => {
      setConnectivity(status);
      // Record only on CHANGE — never on every subscription tick.
      if (status !== lastStatus) {
        lastStatus = status;
        recordNetworkTransition(status);
      }
      owner.setConnectivity(status);
    });
    const active = AppState.currentState === "active";
    let lastActive: boolean | undefined;
    // The initial AppState value IS a real lifecycle state of this mount;
    // record it once so support sees the session's foreground baseline.
    recordAppStateTransition(active);
    lastActive = active;
    owner.setAppActive(active);
    const subscription = AppState.addEventListener("change", (state) => {
      const next = state === "active";
      if (next !== lastActive) {
        lastActive = next;
        recordAppStateTransition(next);
      }
      owner.setAppActive(next);
    });
    return () => {
      unsubscribe();
      subscription.remove();
      owner.dispose();
    };
  }, [runtime]);
  return connectivity;
}
