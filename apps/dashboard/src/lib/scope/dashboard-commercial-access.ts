import type { SubscriptionState } from "@valet/contracts";

export type DashboardCommercialRequirement =
  | "DASHBOARD"
  | "BRANDING"
  | "SUBSCRIPTION_READ";

export type DashboardRouteAccessRequirement =
  | "FOUNDATION_ENTRY"
  | DashboardCommercialRequirement;

export interface DashboardCommercialAccess {
  readonly dashboardAccess: boolean;
  readonly basicBranding: boolean;
  readonly subscriptionRead: boolean;
}

export interface DashboardRouteAccess {
  readonly foundationEntryAuthorized: boolean;
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
  return requirement === "FOUNDATION_ENTRY"
    ? access.foundationEntryAuthorized
    : allowsDashboardCommercialRequirement(requirement, access.commercial);
}
