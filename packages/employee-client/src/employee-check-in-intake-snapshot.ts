import { createdCheckInSession } from "./employee-check-in-domain";
import { continuationForSession } from "./employee-check-in-continuation";
import type { EmployeeCheckInIntakeOutcome } from "./employee-check-in-intake";
import type { EmployeeCheckInSnapshot } from "./employee-check-in-types";

export function checkInIntakeSnapshot(
  snapshot: EmployeeCheckInSnapshot,
  outcome: EmployeeCheckInIntakeOutcome,
): EmployeeCheckInSnapshot {
  if (outcome.kind === "SUCCESS") {
    const active = createdCheckInSession(outcome.result, snapshot.vehicle);
    return {
      ...snapshot,
      active,
      continuation: {
        ...continuationForSession(active, "select-condition"),
        conditionSelection: "No visible issue",
      },
      error: null,
      phase: "created",
      recoverables: [],
    };
  }
  if (outcome.kind === "AMBIGUOUS") {
    return {
      ...snapshot,
      error: outcome.failure,
      phase: "intake-ambiguous",
      recoveryChecked: false,
    };
  }
  const stale = outcome.failure.code === "RETURNING_CUSTOMER_INTENT_INVALID";
  return {
    ...snapshot,
    error: outcome.failure,
    phase: "customer",
    recognizedVehicle:
      stale && snapshot.recognizedVehicle
        ? { ...snapshot.recognizedVehicle, returningCustomer: null }
        : snapshot.recognizedVehicle,
  };
}
