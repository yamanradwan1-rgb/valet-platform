import type { EmployeeHandoffPhase } from "@valet/employee-client";

export function nativeHandoffBackBlocked(phase: EmployeeHandoffPhase): boolean {
  return [
    "aborting",
    "initiating",
    "overriding",
    "reconciling",
    "verifying",
  ].includes(phase);
}
