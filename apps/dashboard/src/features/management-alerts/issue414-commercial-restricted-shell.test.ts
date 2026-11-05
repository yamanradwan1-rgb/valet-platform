import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedDashboardScope } from "../../components/scope";
import { revalidateSelectedScope } from "../../components/foundation/revalidate-selected-scope";
import { managementAlertsLocation } from "./alert-scope";

const organizationId = "11111111-1111-4111-8111-111111111111";
const scope: SelectedDashboardScope = {
  authority: "COMPANY_ADMIN_SUBSCRIPTION",
  organization: {
    organizationId,
    name: "Org",
    timezone: "Asia/Amman",
  },
};

describe("ALT-17 restricted CA subscription utility boundary", () => {
  it.each([false, true])(
    "allows CA subscription utility with dashboardAccess=%s, but denies ordinary management shell and bell",
    async (dashboardAccess) => {
      const request = vi.fn(async (path: string) => {
        expect(path).toBe(
          `/v1/staff/management/organizations/${organizationId}/subscription`,
        );
        return {
          organizationId,
          subscription: {
            planCode: "TRIAL",
            status: "SUSPENDED",
            entitlements: {
              basicBranding: true,
              dashboardAccess,
              reportExports: true,
            },
          },
        };
      });
      const api = { request } as unknown as DashboardApiClient;
      const utility = await revalidateSelectedScope(api, scope, "SUBSCRIPTION_READ");
      expect(utility.status).toBe("valid");
      expect(utility.routeAccess?.commercial.dashboardAccess).toBe(dashboardAccess);
      expect(managementAlertsLocation(scope)).toBeNull();
      for (const requirement of [
        "DASHBOARD",
        "FOUNDATION_ENTRY",
        "LOCATION_MAPS",
        "MANAGEMENT_INTELLIGENCE",
      ] as const) {
        expect((await revalidateSelectedScope(api, scope, requirement)).status)
          .toBe("denied");
      }
      // Denied protected routes never even probe a new commercial source.
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
});
