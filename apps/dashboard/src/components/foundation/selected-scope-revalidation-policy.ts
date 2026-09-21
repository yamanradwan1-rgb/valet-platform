import type { ManagementContextResponse, ManagementScope } from "@valet/contracts";

import {
  DashboardApiError,
  type DashboardApiErrorKind,
} from "../../lib/api/dashboard-api-error";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import type { SelectedDashboardScope } from "../scope";

export function selectedScopeRevalidationKey(
  sessionGeneration: number,
  identityGeneration: number,
  accessRequirement: DashboardRouteAccessRequirement,
  scope: SelectedDashboardScope | null,
): string {
  const prefix = `${sessionGeneration}:${identityGeneration}:${accessRequirement}`;
  if (scope === null) return `${prefix}:none`;
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return `${prefix}:ca-subscription:${scope.organization.organizationId}`;
  }
  if (scope.authority === "COMPANY_ADMIN") {
    const selected = scope.context.scope;
    const suffix =
      selected.kind === "LOCATION"
        ? `location:${selected.locationId}`
        : "all-locations";
    return `${prefix}:ca:${scope.context.organization.organizationId}:${suffix}`;
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return `${prefix}:lm:${scope.organization.organizationId}:${scope.location.locationId}`;
  }
  return [
    prefix,
    "sup",
    scope.context.organization.organizationId,
    scope.context.membershipId,
    scope.context.location.locationId,
    scope.context.activeShift.shiftId,
  ].join(":");
}

export function classifyScopeRevalidationFailure(
  reason: unknown,
): {
  readonly status: "denied" | "entitlement" | "error";
  readonly errorKind: DashboardApiErrorKind | null;
} {
  if (!(reason instanceof DashboardApiError)) {
    return { status: "error", errorKind: null };
  }
  if (reason.kind === "entitlement") {
    return { status: "entitlement", errorKind: reason.kind };
  }
  if (
    reason.kind === "auth" ||
    reason.kind === "mfa" ||
    reason.kind === "authorization"
  ) {
    return { status: "denied", errorKind: reason.kind };
  }
  return { status: "error", errorKind: reason.kind };
}

export function sameManagementScope(
  current: ManagementScope,
  expected: ManagementScope,
): boolean {
  if (current.kind !== expected.kind) return false;
  return current.kind === "ALL_LOCATIONS" ||
    (expected.kind === "LOCATION" && current.locationId === expected.locationId);
}

export function isActiveExactCompanyLocationContext(
  context: ManagementContextResponse,
  expected: ManagementScope,
): boolean {
  return expected.kind === "LOCATION" &&
    sameManagementScope(context.scope, expected) &&
    context.selectedLocation?.locationId === expected.locationId &&
    context.selectedLocation.status === "ACTIVE";
}
