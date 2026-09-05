import type {
  StaffOperationalContextResponse,
  StaffOperationalLocation,
} from "@valet/contracts";

export interface EmployeeShiftStartAuthority {
  readonly identityGeneration: number;
  readonly location: StaffOperationalLocation;
  readonly membershipId: string;
  readonly organizationId: string;
}

export interface EmployeeShiftStartContext {
  readonly active: readonly EmployeeShiftStartAuthority[];
  readonly startable: readonly EmployeeShiftStartAuthority[];
}

export function employeeShiftStartAuthorityKey(
  authority: EmployeeShiftStartAuthority,
): string {
  return [
    authority.identityGeneration,
    authority.membershipId,
    authority.organizationId,
    authority.location.locationId,
  ].join(":");
}

export function resolveEmployeeShiftStartContext(
  identityGeneration: number,
  response: StaffOperationalContextResponse,
): EmployeeShiftStartContext {
  const active: EmployeeShiftStartAuthority[] = [];
  const startable: EmployeeShiftStartAuthority[] = [];
  const seen = new Set<string>();

  for (const context of response.contexts) {
    const base = {
      identityGeneration,
      membershipId: context.membershipId,
      organizationId: context.organization.organizationId,
    };
    if (context.activeShift !== null && context.currentLocation !== null) {
      active.push({ ...base, location: context.currentLocation });
    }
    for (const location of context.eligibleLocations) {
      if (seen.has(location.locationId)) continue;
      seen.add(location.locationId);
      startable.push({ ...base, location });
    }
  }

  return { active, startable };
}

export function isSameEmployeeShiftStartAuthority(
  left: EmployeeShiftStartAuthority,
  right: EmployeeShiftStartAuthority,
): boolean {
  return (
    employeeShiftStartAuthorityKey(left) ===
    employeeShiftStartAuthorityKey(right)
  );
}
