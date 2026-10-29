import type { DashboardFeatureAuthorityFeature } from "@valet/contracts";

import {
  allowsDashboardCommercialRequirement,
  noDashboardCommercialAccess,
  type DashboardCommercialAccess,
  type DashboardRouteAccessRequirement,
} from "../scope/dashboard-commercial-access";

export type NavigationFeatureEligibility =
  | "NOT_APPLICABLE"
  | "ELIGIBLE"
  | "DENIED"
  | "UNAVAILABLE";

export interface NavigationAuthority {
  readonly commercial: DashboardCommercialAccess;
  readonly emergencyTasksEligible?: boolean;
  readonly features: Readonly<
    Record<DashboardFeatureAuthorityFeature, NavigationFeatureEligibility>
  >;
  readonly foundationEntryEligible: boolean;
  readonly locationMapsEligible: boolean;
  readonly managementIntelligenceEligible: boolean;
}

export const noNavigationAuthority: NavigationAuthority = {
  commercial: noDashboardCommercialAccess,
  emergencyTasksEligible: false,
  features: {
    MANAGEMENT_AUDIT: "NOT_APPLICABLE",
    VISIT_CONTACTS: "NOT_APPLICABLE",
  },
  foundationEntryEligible: false,
  locationMapsEligible: false,
  managementIntelligenceEligible: false,
};

export function navigationFeatureForRequirement(
  requirement: DashboardRouteAccessRequirement,
): DashboardFeatureAuthorityFeature | null {
  if (requirement === "MANAGEMENT_AUDIT" || requirement === "VISIT_CONTACTS") {
    return requirement;
  }
  return null;
}

export function allowsNavigationAccessRequirement(
  requirement: DashboardRouteAccessRequirement,
  authority: NavigationAuthority,
): boolean {
  if (requirement === "FOUNDATION_ENTRY") {
    return authority.foundationEntryEligible;
  }
  if (requirement === "EMERGENCY_TASKS") {
    return authority.emergencyTasksEligible === true;
  }
  if (requirement === "LOCATION_MAPS") {
    return authority.locationMapsEligible;
  }
  if (requirement === "MANAGEMENT_INTELLIGENCE") {
    return authority.managementIntelligenceEligible;
  }
  const feature = navigationFeatureForRequirement(requirement);
  if (feature !== null) return authority.features[feature] === "ELIGIBLE";
  if (
    requirement === "DASHBOARD" ||
    requirement === "BRANDING" ||
    requirement === "SUBSCRIPTION_READ"
  ) {
    return allowsDashboardCommercialRequirement(requirement, authority.commercial);
  }
  return false;
}
