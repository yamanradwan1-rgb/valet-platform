import type { SubscriptionState } from "@valet/contracts";

export type DashboardCommercialRequirement =
  | "DASHBOARD"
  | "BRANDING"
  | "SUBSCRIPTION_READ";

export interface DashboardCommercialAccess {
  readonly dashboardAccess: boolean;
  readonly basicBranding: boolean;
  readonly subscriptionRead: boolean;
}

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

export const supervisorDashboardCommercialAccess: DashboardCommercialAccess = {
  dashboardAccess: true,
  basicBranding: false,
  subscriptionRead: false,
};
