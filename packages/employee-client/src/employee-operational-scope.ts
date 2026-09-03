import type { StaffOperationalContextResponse } from "@valet/contracts/staff-context";

import type { EmployeeOperationalScope } from "./employee-operational-types";

export type EmployeeOperationalScopeResolution =
  | { readonly phase: "ambiguous-active-shifts" | "no-active-shift" }
  | { readonly phase: "ready"; readonly scope: EmployeeOperationalScope };

export function resolveEmployeeOperationalScope(
  response: StaffOperationalContextResponse,
): EmployeeOperationalScopeResolution {
  const active = response.contexts.filter(
    (context) =>
      context.activeShift !== null && context.currentLocation !== null,
  );
  if (active.length === 0) return { phase: "no-active-shift" };
  if (active.length !== 1) return { phase: "ambiguous-active-shifts" };
  const context = active[0]!;
  return {
    phase: "ready",
    scope: {
      locationCode: context.currentLocation!.code,
      locationId: context.currentLocation!.locationId,
      locationName: context.currentLocation!.name,
      membershipId: context.membershipId,
      organizationId: context.organization.organizationId,
      organizationName: context.organization.name,
      role: context.role,
      shiftId: context.activeShift!.shiftId,
      shiftStartedAt: context.activeShift!.startedAt,
    },
  };
}
