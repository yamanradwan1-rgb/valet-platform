/** Current, persisted Location state: never derive ALT-16 from old stop events. */
export interface LocationIntakeAlertState {
  readonly status: "ACTIVE" | "INACTIVE";
  readonly acceptingIntake: boolean;
}

/**
 * ALT-16's condition-only predicate, independent of future recipient policy.
 *
 * A newly-created or safely deactivated Location can be INACTIVE with
 * acceptingIntake=false, which does not represent a current intake stoppage.
 * Any caller must first prove fresh exact-source Location authorization,
 * commercial entitlement and Staff assurance (OD-08 remains unaccepted).
 *
 * Does NOT emit an alert or establish a "stopped since" clock/Seen identity.
 */
export function hasCurrentActiveIntakeStop(
  location: LocationIntakeAlertState,
): boolean {
  return location.status === "ACTIVE" && !location.acceptingIntake;
}
