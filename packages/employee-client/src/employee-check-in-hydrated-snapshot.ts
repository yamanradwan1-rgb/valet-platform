import { continuationForSession } from "./employee-check-in-continuation";
import { emptyEmployeeCheckInSnapshot } from "./employee-check-in-state";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInSnapshot,
} from "./employee-check-in-types";
import type { EmployeeOperationalFailure } from "./employee-operational-types";

export function isCheckInRevalidationEligible({
  active,
  continuation,
  phase,
}: EmployeeCheckInSnapshot): boolean {
  return (
    active !== null &&
    (phase === "created" || phase === "continuation") &&
    !["submitting", "reconciling", "ambiguous"].includes(continuation.mode)
  );
}

export function hydratedCheckInSnapshot(
  snapshot: EmployeeCheckInSnapshot,
  active: EmployeeCheckInAuthoritativeSession,
  preserveCompatible = false,
): EmployeeCheckInSnapshot {
  const checkingIn = active.state === "CHECKING_IN";
  const phase = checkingIn ? "created" : "continuation";
  const previous = snapshot.active;
  if (
    preserveCompatible &&
    previous?.vehicle.vehicleId !== active.vehicle.vehicleId
  )
    throw new Error("The check-in vehicle has changed.");
  if (
    preserveCompatible &&
    previous?.state === active.state &&
    previous.version === active.version &&
    previous.conditionCompletedAt === active.conditionCompletedAt &&
    previous.vehicle.vehicleUpdatedAt === active.vehicle.vehicleUpdatedAt
  ) {
    return { ...snapshot, active, error: null, phase };
  }
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
    phase,
    recoverables: [],
  };
}

export function failedCheckInHydration(
  snapshot: EmployeeCheckInSnapshot,
  failure: EmployeeOperationalFailure,
): EmployeeCheckInSnapshot {
  const retained = isCheckInHydrationDenied(failure)
    ? emptyEmployeeCheckInSnapshot()
    : snapshot;
  return {
    ...retained,
    identityGeneration: snapshot.identityGeneration,
    locationId: snapshot.locationId,
    error: failure,
    phase: "discovery-error",
  };
}

export function isCheckInHydrationDenied(
  failure: EmployeeOperationalFailure,
): boolean {
  return (
    failure.status === 401 ||
    [
      "AUTHORIZATION_DENIED",
      "LOCATION_ACCESS_DENIED",
      "TENANT_ACCESS_DENIED",
    ].includes(failure.code)
  );
}
