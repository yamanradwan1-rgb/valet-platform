import type { EmployeeRetrievalPhase } from "@valet/employee-client";

/**
 * Back is blocked while a protected Retrieval command is in flight or its
 * outcome is being reconciled, so navigation cannot create a second release
 * of the same protected operation or strand an unknown result.
 */
export function nativeRetrievalBackBlocked(
  phase: EmployeeRetrievalPhase,
): boolean {
  return (
    phase === "submitting-start" ||
    phase === "submitting-ready" ||
    phase === "reconciling"
  );
}
