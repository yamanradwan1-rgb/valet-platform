import type { SelectedDashboardScope } from "../../components/scope";
import { selectedScopeAuthorityKey } from "../../components/foundation/selected-scope-revalidation-policy";

export interface AdministrationScope {
  readonly authority: "COMPANY_ADMIN" | "COMPANY_ADMIN_SUBSCRIPTION" | "LOCATION_MANAGER" | "SUPERVISOR";
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly locationStatus: "ACTIVE" | "INACTIVE" | null;
}

export function administrationScope(selected: SelectedDashboardScope): AdministrationScope {
  if (selected.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return { authority: selected.authority, organizationId: selected.organization.organizationId, locationId: null, locationStatus: null };
  }
  if (selected.authority === "COMPANY_ADMIN") {
    return {
      authority: selected.authority,
      organizationId: selected.context.organization.organizationId,
      locationId: selected.context.selectedLocation?.locationId ?? null,
      locationStatus: selected.context.selectedLocation?.status ?? null,
    };
  }
  if (selected.authority === "LOCATION_MANAGER") {
    return {
      authority: selected.authority,
      organizationId: selected.organization.organizationId,
      locationId: selected.location.locationId,
      locationStatus: selected.location.status,
    };
  }
  if (selected.authority === "LOCATION_MANAGER_GRANT_SET") {
    throw new Error("Organization grant-set scope is not an Administration scope.");
  }
  return {
    authority: selected.authority,
    organizationId: selected.context.organization.organizationId,
    locationId: selected.context.location.locationId,
    locationStatus: "ACTIVE",
  };
}

export function administrationScopeKey(input: {
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
  readonly selectedScope: SelectedDashboardScope;
}): string {
  administrationScope(input.selectedScope);
  return [
    input.identityGeneration,
    input.sessionGeneration,
    input.selectionRevision,
    "administration",
    selectedScopeAuthorityKey(input.selectedScope),
  ].join(":");
}
