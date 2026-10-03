import { continuationForSession } from "./employee-check-in-continuation";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInSnapshot,
} from "./employee-check-in-types";

export function hydratedCheckInSnapshot(
  snapshot: EmployeeCheckInSnapshot,
  active: EmployeeCheckInAuthoritativeSession,
): EmployeeCheckInSnapshot {
  const checkingIn = active.state === "CHECKING_IN";
  return {
    ...snapshot,
    active,
    continuation: checkingIn
      ? {
          ...continuationForSession(active, "select-condition"),
          conditionSelection: "No visible issue",
        }
      : continuationForSession(active),
    error: null,
    phase: checkingIn ? "created" : "continuation",
    recoverables: [],
  };
}
