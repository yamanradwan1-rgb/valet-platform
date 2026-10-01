import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import type { LocationSwitchSourceScope } from "../scope/location-switch-authority";
import type { SelectedDashboardScope } from "../scope";

export function isLocationSwitchSource(
  scope: SelectedDashboardScope | null,
): scope is LocationSwitchSourceScope {
  return (
    scope?.authority === "COMPANY_ADMIN" ||
    scope?.authority === "LOCATION_MANAGER" ||
    scope?.authority === "LOCATION_MANAGER_GRANT_SET"
  );
}

export function selectedManagementLocationStatus(
  scope: SelectedDashboardScope,
) {
  if (scope.authority === "COMPANY_ADMIN")
    return scope.context.selectedLocation?.status ?? null;
  if (scope.authority === "LOCATION_MANAGER") return scope.location.status;
  return null;
}

export function isDashboardUnavailable(
  requirement: DashboardRouteAccessRequirement,
): boolean {
  return (
    requirement === "DASHBOARD" ||
    requirement === "FOUNDATION_ENTRY" ||
    requirement === "LOCATION_MAPS"
  );
}
