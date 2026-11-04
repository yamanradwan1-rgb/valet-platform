import type { SelectedDashboardScope } from "../../components/scope";

export function managementAlertsLocation(
  selected: SelectedDashboardScope,
): string | null {
  if (selected.authority === "COMPANY_ADMIN") {
    const scope = selected.context.scope;
    if (scope.kind !== "LOCATION") return null;
    return selected.context.selectedLocation?.locationId === scope.locationId &&
      selected.context.selectedLocation.status === "ACTIVE"
      ? scope.locationId : null;
  }
  if (selected.authority === "LOCATION_MANAGER") {
    return selected.location.status === "ACTIVE" ? selected.location.locationId : null;
  }
  return null;
}
