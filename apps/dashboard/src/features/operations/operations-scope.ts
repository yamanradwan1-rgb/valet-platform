import type { SelectedDashboardScope } from "../../components/scope";

export interface OperationsScope {
  readonly authority: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly locationStatus: "ACTIVE" | "INACTIVE" | null;
}

export function operationsScope(selected: SelectedDashboardScope): OperationsScope {
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
    return {
      authority: "LOCATION_MANAGER",
      organizationId: selected.organization.organizationId,
      locationId: null,
      locationStatus: null,
    };
  }
  if (selected.authority === "SUPERVISOR") {
    return {
      authority: selected.authority,
      organizationId: selected.context.organization.organizationId,
      locationId: selected.context.location.locationId,
      locationStatus: "ACTIVE",
    };
  }
  return {
    authority: "COMPANY_ADMIN",
    organizationId: selected.organization.organizationId,
    locationId: null,
    locationStatus: null,
  };
}

export function operationsScopeKey(input: {
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly selectedScope: SelectedDashboardScope;
}): string {
  const scope = operationsScope(input.selectedScope);
  return [
    input.identityGeneration,
    input.sessionGeneration,
    scope.authority,
    scope.organizationId,
    scope.locationId ?? "no-location",
  ].join(":");
}

export function hasExactActiveLocation(scope: OperationsScope): scope is OperationsScope & {
  readonly locationId: string;
  readonly locationStatus: "ACTIVE";
} {
  return scope.locationId !== null && scope.locationStatus === "ACTIVE";
}
