import { useEffect } from "react";
import type {
  EmployeeOperationalScope,
  EmployeeVehicleDirectorySession,
  EmployeeVehicleDirectorySnapshot,
} from "@valet/employee-client";

export function useNativeVehicleDirectoryRevalidation(input: {
  readonly directory: EmployeeVehicleDirectorySession | undefined;
  readonly identityGeneration: number;
  readonly scope: EmployeeOperationalScope | null;
  readonly snapshot: EmployeeVehicleDirectorySnapshot;
}) {
  const { directory, identityGeneration, scope } = input;

  useEffect(() => {
    if (directory === undefined || scope === null) return;
    void directory.activate(identityGeneration, scope);
  }, [directory, identityGeneration, scope]);
}
