import { useEffect } from "react";
import { AppState } from "react-native";
import type {
  EmployeeOperationalScope,
  EmployeeOperationalFailure,
  EmployeeVehicleDirectorySession,
  EmployeeVehicleDirectorySnapshot,
} from "@valet/employee-client";

export const vehicleDirectoryRecoveryDelayMs = 5_000;

type RecoveryDirectory = Pick<
  EmployeeVehicleDirectorySession,
  "current" | "refresh"
>;

export function shouldAutoRecoverVehicleDirectory(
  failure: EmployeeOperationalFailure | null,
) {
  return failure?.code === "NETWORK_ERROR" && failure.status === 0;
}

export function scheduleVehicleDirectoryRecovery(
  directory: RecoveryDirectory,
  isForeground: () => boolean,
  delay = vehicleDirectoryRecoveryDelayMs,
) {
  // The approved Native stack has no network-event package. Only the canonical
  // transport-level network failure may drive this foreground recovery probe.
  const timer = setTimeout(() => {
    const current = directory.current();
    if (
      isForeground() &&
      current.phase === "error" &&
      shouldAutoRecoverVehicleDirectory(current.failure)
    ) {
      void directory.refresh();
    }
  }, delay);
  return () => clearTimeout(timer);
}

export function useNativeVehicleDirectoryRevalidation(input: {
  readonly directory: EmployeeVehicleDirectorySession | undefined;
  readonly identityGeneration: number;
  readonly scope: EmployeeOperationalScope | null;
  readonly snapshot: EmployeeVehicleDirectorySnapshot;
}) {
  const { directory, identityGeneration, scope, snapshot } = input;

  useEffect(() => {
    if (directory === undefined || scope === null) return;
    void directory.activate(identityGeneration, scope);
  }, [directory, identityGeneration, scope]);

  useEffect(() => {
    if (directory === undefined || scope === null) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void directory.refresh();
    });
    return () => subscription.remove();
  }, [directory, scope]);

  useEffect(() => {
    if (
      directory === undefined ||
      scope === null ||
      snapshot.phase !== "error" ||
      !shouldAutoRecoverVehicleDirectory(snapshot.failure) ||
      AppState.currentState !== "active"
    ) {
      return;
    }
    return scheduleVehicleDirectoryRecovery(
      directory,
      () => AppState.currentState === "active",
    );
  }, [directory, scope, snapshot.failure, snapshot.phase]);
}
