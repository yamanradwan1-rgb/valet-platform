import { CircleHelp } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { DashboardNavigationRegistration } from "../../lib/navigation/navigation-types";
import type { SelectedDashboardScope } from "../scope";
import { resolveNavigationAuthority } from "./resolve-navigation-authority";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};

const companyOnlyVisit: DashboardNavigationRegistration = {
  accessRequirement: "VISIT_CONTACTS",
  availability: "IMPLEMENTED",
  href: "/test-company-visit",
  icon: CircleHelp,
  id: "test-company-visit",
  labels: { ar: "اختبار", en: "Test" },
  owner: "MD-04",
  placement: "MAIN",
  roles: ["COMPANY_ADMIN"],
  scopeRequirement: "ORGANIZATION",
};

describe("navigation authority demand filtering", () => {
  it("does not probe a server feature for an incompatible navigation role", async () => {
    const request = vi.fn();
    const scope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER_GRANT_SET",
      organization,
    };
    const authority = await resolveNavigationAuthority({
      api: { request } as unknown as DashboardApiClient,
      registrations: [companyOnlyVisit],
      selectedScope: scope,
    });

    expect(request).not.toHaveBeenCalled();
    expect(authority.features.VISIT_CONTACTS).toBe("NOT_APPLICABLE");
  });
});
