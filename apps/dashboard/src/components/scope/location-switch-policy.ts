import type { ManagementLocation } from "@valet/contracts";

import {
  dashboardNavigationRegistrations,
  firstMainNavigationHref,
  isNavigationPathActive,
  type DashboardNavigationItem,
  type DashboardNavigationRegistration,
} from "../../lib/navigation";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import {
  allowsCompanyAdminAllLocations,
  canSelectScopeLocation,
} from "./scope-entry-route-policy";
import type { ScopeEntryAuthority } from "./scope-entry-types";

export function allowsAllLocationsForPath(
  currentPath: string,
  accessRequirement: DashboardRouteAccessRequirement,
  registrations: readonly DashboardNavigationRegistration[] = dashboardNavigationRegistrations,
): boolean {
  const registration = registrationForPath(currentPath, registrations);
  return (
    registration !== null &&
    registration.scopeRequirement !== "LOCATION" &&
    allowsCompanyAdminAllLocations(accessRequirement)
  );
}

export function canOfferLocationForPath(
  currentPath: string,
  accessRequirement: DashboardRouteAccessRequirement,
  authority: ScopeEntryAuthority,
  location: ManagementLocation,
  registrations: readonly DashboardNavigationRegistration[] = dashboardNavigationRegistrations,
): boolean {
  if (!canSelectScopeLocation(authority, accessRequirement, location))
    return false;
  const registration = registrationForPath(currentPath, registrations);
  if (
    authority === "COMPANY_ADMIN" &&
    registration?.id === "keys" &&
    location.status === "INACTIVE"
  )
    return true;
  return (
    registration?.scopeRequirement !== "LOCATION" ||
    location.status === "ACTIVE"
  );
}

export function navigationForLocationStatus(
  navigation: readonly DashboardNavigationItem[],
  locationStatus: ManagementLocation["status"] | null,
  allowInactiveKeys: boolean,
  registrations: readonly DashboardNavigationRegistration[] = dashboardNavigationRegistrations,
): readonly DashboardNavigationItem[] {
  if (locationStatus !== "INACTIVE") return navigation;
  return navigation.filter(
    (item) =>
      (allowInactiveKeys && item.id === "keys") ||
      registrationForPath(item.href, registrations)?.scopeRequirement !==
        "LOCATION",
  );
}

export function isCurrentPathAuthorized(
  currentPath: string,
  navigation: readonly DashboardNavigationItem[],
): boolean {
  return navigation.some((item) =>
    isNavigationPathActive(currentPath, item.href),
  );
}

export function safeLocationSwitchLanding(
  navigation: readonly DashboardNavigationItem[],
): string | null {
  return firstMainNavigationHref(navigation) ?? navigation[0]?.href ?? null;
}

export function registrationForPath(
  currentPath: string,
  registrations: readonly DashboardNavigationRegistration[] = dashboardNavigationRegistrations,
): DashboardNavigationRegistration | null {
  return (
    registrations.find((item) =>
      isNavigationPathActive(currentPath, item.href),
    ) ?? null
  );
}
