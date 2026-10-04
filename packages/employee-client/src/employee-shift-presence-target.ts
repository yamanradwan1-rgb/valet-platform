import type { EmployeeShiftStartAuthority } from "./employee-shift-start-context";
import type { EmployeeShiftEndAuthority } from "./employee-shift-end-types";
import type { PresenceTarget } from "./employee-shift-presence-types";

export function startPresenceTarget(
  authority: EmployeeShiftStartAuthority,
): PresenceTarget {
  return {
    identityGeneration: authority.identityGeneration,
    organizationId: authority.organizationId,
    membershipId: authority.membershipId,
    locationId: authority.location.locationId,
    action: "START",
    shiftId: null,
    cashReported: null,
  };
}

export function matchesStartPresenceTarget(
  authority: EmployeeShiftStartAuthority | undefined,
  target: PresenceTarget,
): boolean {
  return (
    authority !== undefined &&
    authority.identityGeneration === target.identityGeneration &&
    authority.membershipId === target.membershipId &&
    authority.organizationId === target.organizationId &&
    authority.location.locationId === target.locationId
  );
}
export function endPresenceTarget(
  authority: EmployeeShiftEndAuthority,
  cashReported: string,
): PresenceTarget {
  const [whole, fraction = ""] = cashReported.split(".");
  const decimal = fraction.replace(/0+$/, "");
  return {
    identityGeneration: authority.identityGeneration,
    organizationId: authority.organizationId,
    membershipId: authority.membershipId,
    locationId: authority.locationId,
    action: "END",
    shiftId: authority.shiftId,
    cashReported: decimal === "" ? whole! : `${whole}.${decimal}`,
    shiftStartedAt: authority.shiftStartedAt,
    currency: authority.currency,
    role: authority.role,
  };
}
