import { describe, expect, it } from "vitest";

import {
  allowsDashboardCommercialRequirement,
  commercialAccessFromSubscription,
} from "./dashboard-commercial-access";

function subscription(dashboardAccess: boolean, basicBranding: boolean) {
  return {
    planCode: "TEST",
    status: "ACTIVE" as const,
    entitlements: {
      dashboardAccess,
      reportExports: false,
      basicBranding,
    },
  };
}

describe("dashboard commercial access", () => {
  it("keeps subscription read available for a null subscription", () => {
    const access = commercialAccessFromSubscription(null);
    expect(allowsDashboardCommercialRequirement("SUBSCRIPTION_READ", access)).toBe(true);
    expect(allowsDashboardCommercialRequirement("DASHBOARD", access)).toBe(false);
    expect(allowsDashboardCommercialRequirement("BRANDING", access)).toBe(false);
  });

  it("requires dashboard access for normal Management routes", () => {
    const access = commercialAccessFromSubscription(subscription(false, true));
    expect(allowsDashboardCommercialRequirement("DASHBOARD", access)).toBe(false);
  });

  it("requires both dashboard and basic-branding entitlements for Branding", () => {
    const brandOnly = commercialAccessFromSubscription(subscription(false, true));
    const dashboardOnly = commercialAccessFromSubscription(subscription(true, false));
    const both = commercialAccessFromSubscription(subscription(true, true));

    expect(allowsDashboardCommercialRequirement("BRANDING", brandOnly)).toBe(false);
    expect(allowsDashboardCommercialRequirement("BRANDING", dashboardOnly)).toBe(false);
    expect(allowsDashboardCommercialRequirement("BRANDING", both)).toBe(true);
  });
});
