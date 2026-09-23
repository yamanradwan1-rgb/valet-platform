import type { ManagementLocation } from "@valet/contracts";

import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import type { ScopeEntryAuthority } from "./scope-entry-types";

export function shouldDiscoverSupervisorScopes(
  accessRequirement: DashboardRouteAccessRequirement,
): boolean {
  return accessRequirement === "FOUNDATION_ENTRY" ||
    accessRequirement === "LOCATION_MAPS" ||
    accessRequirement === "MANAGEMENT_AUDIT";
}

export function allowsCompanyAdminAllLocations(
  accessRequirement: DashboardRouteAccessRequirement,
): boolean {
  return accessRequirement !== "LOCATION_MAPS";
}

export function canSelectScopeLocation(
  authority: ScopeEntryAuthority,
  accessRequirement: DashboardRouteAccessRequirement,
  location: ManagementLocation,
): boolean {
  return location.status === "ACTIVE" ||
    (
      authority === "COMPANY_ADMIN" &&
      accessRequirement !== "LOCATION_MAPS" &&
      accessRequirement !== "MANAGEMENT_INTELLIGENCE"
    ) ||
    (authority === "LOCATION_MANAGER" && accessRequirement === "MANAGEMENT_AUDIT");
}

export function canSelectCompanyAdminScope(
  accessRequirement: DashboardRouteAccessRequirement,
  location: ManagementLocation | null,
): boolean {
  if (accessRequirement === "MANAGEMENT_INTELLIGENCE") {
    return location === null || location.status === "ACTIVE";
  }
  return accessRequirement !== "LOCATION_MAPS" ||
    (location !== null && location.status === "ACTIVE");
}
