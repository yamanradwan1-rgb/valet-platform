import { useEffect } from "react";
import { AppState } from "react-native";
import type {
  EmployeeOperationalScope,
  EmployeeVehicleDirectorySession,
  EmployeeVehicleDirectorySnapshot,
} from "@valet/employee-client";

export const vehicleDirectoryRecoveryDelayMs = 5_000;

type RecoveryDirectory = Pick<
  EmployeeVehicleDirectorySession,
  "current" | "refresh"
>;

export function scheduleVehicleDirectoryRecovery(
  directory: RecoveryDirectory,
  isForeground: () => boolean,
  delay = vehicleDirectoryRecoveryDelayMs,
) {
  // The approved Native stack has no network-event package. A failed
  // authoritative read is therefore the trustworthy offline signal: retry
  // while this surface remains foreground until a later read can prove fresh.
  const timer = setTimeout(() => {
    if (isForeground() && directory.current().phase === "error") {
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
      AppState.currentState !== "active"
    ) {
      return;
    }
    return scheduleVehicleDirectoryRecovery(
      directory,
      () => AppState.currentState === "active",
    );
  }, [directory, scope, snapshot.phase]);
}
