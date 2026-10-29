import type { ManagementLocation } from "@valet/contracts";

import type { SelectedDashboardScope } from "../../components/scope";

export function selectedOperationsLocation(
  selected: SelectedDashboardScope | null,
): ManagementLocation | null {
  if (selected?.authority === "COMPANY_ADMIN") {
    return selected.context.selectedLocation;
  }
  if (selected?.authority === "LOCATION_MANAGER") return selected.location;
  if (selected?.authority === "SUPERVISOR") {
    return { ...selected.context.location, status: "ACTIVE" };
  }
  return null;
}
