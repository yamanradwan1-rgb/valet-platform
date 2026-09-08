import type { EmployeeReleasePhase } from "@valet/employee-client";

export function nativeReleaseBackBlocked(phase: EmployeeReleasePhase): boolean {
  return (
    phase === "releasing" || phase === "reconciling" || phase === "ambiguous"
  );
}
