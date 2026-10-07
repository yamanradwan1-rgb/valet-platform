import type { EmployeeOperationalSnapshot } from "@valet/employee-client";

export const nativeTaskGpsAdmissionMs = 5_000;
export const nativeTaskGpsUploadMs = 10_000;

export type NativeTaskTrackingStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "offline" }
  | { readonly kind: "permission-denied" }
  | { readonly kind: "permission-blocked" }
  | { readonly kind: "services-disabled" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "active"; readonly taskType: "PARKING" | "RETRIEVAL" };

export interface NativeTaskTrackingBinding {
  readonly identityGeneration: number;
  readonly key: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly shiftId: string;
  readonly startedAt: number;
  readonly taskId: string;
  readonly taskType: "PARKING" | "RETRIEVAL";
  readonly trackingSessionId: string;
}

export function nativeTaskTrackingBinding(
  snapshot: EmployeeOperationalSnapshot,
): NativeTaskTrackingBinding | null {
  const scope = snapshot.scope;
  const tracking = snapshot.taskTracking;
  if (
    scope === null ||
    tracking?.status !== "ELIGIBLE" ||
    snapshot.identityGeneration === null
  ) {
    return null;
  }
  const startedAt = Date.parse(tracking.movement.trackingStartedAt);
  if (!Number.isFinite(startedAt)) return null;
  const movement = tracking.movement;
  const key = [
    snapshot.identityGeneration,
    scope.organizationId,
    scope.locationId,
    scope.membershipId,
    scope.shiftId,
    movement.taskId,
    movement.sessionId,
    movement.trackingSessionId,
    movement.trackingStartedAt,
  ].join(":");
  return {
    ...movement,
    identityGeneration: snapshot.identityGeneration,
    key,
    locationId: scope.locationId,
    membershipId: scope.membershipId,
    organizationId: scope.organizationId,
    shiftId: scope.shiftId,
    startedAt,
  };
}
