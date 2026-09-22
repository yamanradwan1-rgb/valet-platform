import type { SubscriptionState } from "@valet/contracts";

export type DashboardCommercialRequirement =
  | "DASHBOARD"
  | "BRANDING"
  | "SUBSCRIPTION_READ";

export type DashboardRouteAccessRequirement =
  | "FOUNDATION_ENTRY"
  | "LOCATION_MAPS"
  | "MANAGEMENT_AUDIT"
  | "VISIT_CONTACTS"
  | DashboardCommercialRequirement;

export interface DashboardCommercialAccess {
  readonly dashboardAccess: boolean;
  readonly basicBranding: boolean;
  readonly subscriptionRead: boolean;
}

export interface DashboardRouteAccess {
  readonly foundationEntryAuthorized: boolean;
  readonly locationMapsAuthorized: boolean;
  readonly managementAuditAuthorized?: boolean;
  readonly visitContactsAuthorized?: boolean;
  readonly commercial: DashboardCommercialAccess;
}

export const noDashboardCommercialAccess: DashboardCommercialAccess = {
  dashboardAccess: false,
  basicBranding: false,
  subscriptionRead: false,
};

export function commercialAccessFromSubscription(
  subscription: SubscriptionState | null,
): DashboardCommercialAccess {
  return {
    dashboardAccess: subscription?.entitlements.dashboardAccess === true,
    basicBranding: subscription?.entitlements.basicBranding === true,
    subscriptionRead: true,
  };
}

export function allowsDashboardCommercialRequirement(
  requirement: DashboardCommercialRequirement,
  access: DashboardCommercialAccess,
): boolean {
  if (requirement === "SUBSCRIPTION_READ") return access.subscriptionRead;
  if (requirement === "BRANDING") {
    return access.dashboardAccess && access.basicBranding;
  }
  return access.dashboardAccess;
}

export function allowsDashboardRouteAccessRequirement(
  requirement: DashboardRouteAccessRequirement,
  access: DashboardRouteAccess,
): boolean {
  if (requirement === "FOUNDATION_ENTRY") {
    return access.foundationEntryAuthorized;
  }
  if (requirement === "LOCATION_MAPS") {
    return access.locationMapsAuthorized;
  }
  if (requirement === "MANAGEMENT_AUDIT") {
    return access.managementAuditAuthorized === true;
  }
  if (requirement === "VISIT_CONTACTS") {
    return access.visitContactsAuthorized === true;
  }
  return allowsDashboardCommercialRequirement(requirement, access.commercial);
}
