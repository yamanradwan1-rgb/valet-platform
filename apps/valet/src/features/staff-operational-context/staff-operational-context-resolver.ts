import type {
  StaffOperationalContextResponse,
  StaffOperationalMembershipContext,
  StaffOperationalRole,
} from "@valet/contracts";

export interface ResolvedOperationalScope {
  readonly activeContext: StaffOperationalMembershipContext;
  /** Authoritative Location currency (ISO 4217), server-derived. */
  readonly currency: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly locationCode: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: StaffOperationalRole;
  readonly shiftId: string;
  readonly shiftStartedAt: string;
}

export type OperationalScopeResolution =
  | { readonly kind: "RESOLVED"; readonly scope: ResolvedOperationalScope }
  | { readonly kind: "NO_ACTIVE_SHIFT" }
  | { readonly kind: "AMBIGUOUS_ACTIVE_SHIFTS"; readonly count: number };

export function resolveOperationalScope(
  response: StaffOperationalContextResponse,
): OperationalScopeResolution {
  const activeContexts = response.contexts.filter(
    (ctx) => ctx.activeShift !== null && ctx.currentLocation !== null,
  );

  if (activeContexts.length === 1) {
    const ctx = activeContexts[0]!;
    return {
      kind: "RESOLVED",
      scope: {
        activeContext: ctx,
        locationId: ctx.currentLocation!.locationId,
        locationName: ctx.currentLocation!.name,
        locationCode: ctx.currentLocation!.code,
        currency: ctx.currentLocation!.currency,
        membershipId: ctx.membershipId,
        organizationId: ctx.organization.organizationId,
        organizationName: ctx.organization.name,
        role: ctx.role,
        shiftId: ctx.activeShift!.shiftId,
        shiftStartedAt: ctx.activeShift!.startedAt,
      },
    };
  }

  if (activeContexts.length === 0) {
    return { kind: "NO_ACTIVE_SHIFT" };
  }

  return {
    kind: "AMBIGUOUS_ACTIVE_SHIFTS",
    count: activeContexts.length,
  };
}
