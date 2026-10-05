import type {
  ShiftPresenceManagementResultQuery,
  ShiftPresenceZone,
} from "@valet/contracts";
import type {
  PresenceCanonical,
  PresenceCompany,
  PresenceLocation,
  PresenceException,
  PresenceTarget,
  PresenceResult,
} from "./shift-presence-api";
import { dashboardMalformedError } from "../../../lib/api/dashboard-api-error";

export function requirePresencePolicy<
  T extends PresenceCompany | PresenceLocation,
>(target: PresenceTarget, value: T): T {
  if (
    value.organizationId !== target.organizationId ||
    ("locationId" in value ? value.locationId : null) !== target.locationId
  )
    throw dashboardMalformedError();
  return value;
}
export function requirePresenceZone(
  target: PresenceTarget,
  zone: ShiftPresenceZone,
  id?: string,
) {
  if (
    zone.organizationId !== target.organizationId ||
    zone.locationId !== target.locationId ||
    (id !== undefined && zone.id !== id)
  )
    throw dashboardMalformedError();
}
export function requirePresenceException<T extends PresenceException>(
  target: PresenceTarget,
  value: T,
  id?: string,
): T {
  if (
    value.locationId !== target.locationId ||
    (id !== undefined && value.exceptionId !== id)
  )
    throw dashboardMalformedError();
  return value;
}
export function requirePresenceResult(
  target: PresenceTarget,
  mutationId: string,
  query: ShiftPresenceManagementResultQuery,
  result: PresenceResult,
) {
  const canonical: PresenceCanonical = result.canonical;
  if (canonical.kind === "POLICY")
    requirePresencePolicy(target, canonical.value);
  else if (canonical.kind === "ZONE") {
    if (canonical.value.zone)
      requirePresenceZone(
        target,
        canonical.value.zone,
        query.kind === "ZONE" ? query.entityId : undefined,
      );
  } else
    requirePresenceException(
      target,
      canonical.value,
      query.kind === "EXCEPTION" ? query.entityId : undefined,
    );
  const expectedEntity =
    query.kind === "POLICY"
      ? (target.locationId ?? target.organizationId)
      : query.entityId;
  if (
    result.mutationId !== mutationId ||
    canonical.kind !== query.kind ||
    (result.attribution === "COMMITTED" && result.entityId !== expectedEntity)
  )
    throw dashboardMalformedError();
  return result;
}
