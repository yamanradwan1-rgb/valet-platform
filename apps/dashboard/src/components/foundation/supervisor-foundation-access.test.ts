import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import type { SelectedDashboardScope } from "../scope";
import { revalidateSelectedScope } from "./use-selected-scope-revalidation";

const organizationId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";
const shiftId = "44444444-4444-4444-8444-444444444444";

const scope: SelectedDashboardScope = {
  authority: "SUPERVISOR",
  context: {
    authority: "SUPERVISOR",
    membershipId,
    organization: { organizationId, name: "Org" },
    location: { locationId, name: "Main", code: "MAIN", currency: "JOD" },
    activeShift: {
      locationId,
      shiftId,
      startedAt: "2026-09-21T00:00:00Z",
      status: "ACTIVE",
    },
  },
};

const operationalContext = {
  role: "VALET_SUPERVISOR",
  membershipId,
  organization: { organizationId, name: "Org" },
  eligibleLocations: [
    { locationId, name: "Main", code: "MAIN", currency: "JOD" },
  ],
  activeShift: {
    locationId,
    shiftId,
    startedAt: "2026-09-21T00:00:00Z",
    status: "ACTIVE",
  },
};

function api(): DashboardApiClient {
  return {
    request: vi.fn().mockResolvedValue({ contexts: [operationalContext] }),
  } as unknown as DashboardApiClient;
}

describe("Supervisor foundation access", () => {
  it("allows exact active-shift foundation entry without commercial entitlement", async () => {
    await expect(
      revalidateSelectedScope(api(), scope, "FOUNDATION_ENTRY"),
    ).resolves.toEqual({
      status: "valid",
      routeAccess: {
        foundationEntryAuthorized: true,
        locationMapsAuthorized: true,
        commercial: {
          dashboardAccess: false,
          basicBranding: false,
          subscriptionRead: false,
        },
      },
    });
  });

  it.each([
    "DASHBOARD",
    "BRANDING",
    "SUBSCRIPTION_READ",
  ] satisfies readonly DashboardRouteAccessRequirement[])(
    "does not turn active-shift eligibility into %s authority",
    async (requirement) => {
      await expect(
        revalidateSelectedScope(api(), scope, requirement),
      ).resolves.toEqual({ status: "denied", routeAccess: null });
    },
  );
});
