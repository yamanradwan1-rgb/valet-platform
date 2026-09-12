import { useEffect, useState } from "react";
import { AppState } from "react-native";
import type { EmployeeConnectivityStatus } from "@valet/employee-client";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { NativeProductionLifecycleOwner } from "./native-production-lifecycle-owner";

export function useNativeProductionLifecycle(
  runtime: NativeEmployeeRuntime | undefined,
): EmployeeConnectivityStatus {
  const [connectivity, setConnectivity] =
    useState<EmployeeConnectivityStatus>("unknown");
  useEffect(() => {
    if (runtime === undefined) return;
    const owner = new NativeProductionLifecycleOwner(runtime);
    const unsubscribe = runtime.connectivity.subscribe((status) => {
      setConnectivity(status);
      owner.setConnectivity(status);
    });
    owner.setAppActive(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      owner.setAppActive(state === "active");
    });
    return () => {
      unsubscribe();
      subscription.remove();
      owner.dispose();
    };
  }, [runtime]);
  return connectivity;
}
