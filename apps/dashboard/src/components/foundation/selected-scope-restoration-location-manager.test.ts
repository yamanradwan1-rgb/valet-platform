import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  restoreSelectedDashboardScope,
  type RestorationDependencies,
} from "./selected-scope-restoration";
import type { SelectedScopeRestorationHint } from "./selected-scope-restoration-hint";

const api = {} as DashboardApiClient;
const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organization = { organizationId, name: "Fresh Org", timezone: "Asia/Amman" };
const location = {
  locationId,
  name: "Fresh B",
  code: "B",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};
const hint: SelectedScopeRestorationHint = {
  authority: "LOCATION_MANAGER",
  organizationId,
  locationId,
  staffAuthSessionId: session,
  version: 1,
};

function dependencies(input: {
  organizations?: RestorationDependencies["listLocationManagerOrganizations"];
  locations?: RestorationDependencies["listLocationManagerLocations"];
}): RestorationDependencies {
  return {
    listActiveSupervisorScopes: vi.fn<RestorationDependencies["listActiveSupervisorScopes"]>().mockResolvedValue([]),
    listCompanyAdminOrganizations: vi.fn<RestorationDependencies["listCompanyAdminOrganizations"]>().mockResolvedValue({ items: [], nextCursor: null }),
    listLocationManagerOrganizations: input.organizations ?? vi.fn<RestorationDependencies["listLocationManagerOrganizations"]>().mockResolvedValue({ items: [organization], nextCursor: null }),
    listLocationManagerLocations: input.locations ?? vi.fn<RestorationDependencies["listLocationManagerLocations"]>().mockResolvedValue({ items: [location], nextCursor: null }),
    resolveCompanyAdminContext: vi.fn<RestorationDependencies["resolveCompanyAdminContext"]>(),
  };
}

describe("Location Manager selected-scope restoration", () => {
  it("restores the exact current ACTIVE Location using fresh Organization and Location objects", async () => {
    const result = await restoreSelectedDashboardScope(api, hint, undefined, dependencies({}));
    expect(result).toEqual({ authority: "LOCATION_MANAGER", organization, location });
    expect(result && "organization" in result ? result.organization.name : null).toBe("Fresh Org");
    expect(result && "location" in result ? result.location.name : null).toBe("Fresh B");
  });

  it("denies when the Organization is no longer listed", async () => {
    const locations = vi.fn<RestorationDependencies["listLocationManagerLocations"]>();
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({
      organizations: vi.fn<RestorationDependencies["listLocationManagerOrganizations"]>().mockResolvedValue({ items: [], nextCursor: null }),
      locations,
    }))).resolves.toBeNull();
    expect(locations).not.toHaveBeenCalled();
  });

  it("denies when the exact Location is no longer listed", async () => {
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({
      locations: vi.fn<RestorationDependencies["listLocationManagerLocations"]>().mockResolvedValue({ items: [], nextCursor: null }),
    }))).resolves.toBeNull();
  });

  it("denies an inactive exact Location and never auto-selects another active Location", async () => {
    const other = { ...location, locationId: "55555555-5555-4555-8555-555555555555", name: "First A" };
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({
      locations: vi.fn<RestorationDependencies["listLocationManagerLocations"]>().mockResolvedValue({
        items: [other, { ...location, status: "INACTIVE" }],
        nextCursor: null,
      }),
    }))).resolves.toBeNull();
  });

  it("paginates Organization and Location listings until the exact target is found", async () => {
    const organizations = vi.fn<RestorationDependencies["listLocationManagerOrganizations"]>()
      .mockResolvedValueOnce({ items: [], nextCursor: "organization_page_2" })
      .mockResolvedValueOnce({ items: [organization], nextCursor: null });
    const locations = vi.fn<RestorationDependencies["listLocationManagerLocations"]>()
      .mockResolvedValueOnce({ items: [], nextCursor: "location_page_2" })
      .mockResolvedValueOnce({ items: [location], nextCursor: null });
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({ organizations, locations })))
      .resolves.toEqual({ authority: "LOCATION_MANAGER", organization, location });
    expect(organizations).toHaveBeenCalledTimes(2);
    expect(locations).toHaveBeenCalledTimes(2);
  });

  it("rejects repeating pagination cursors instead of looping forever", async () => {
    const organizations = vi.fn<RestorationDependencies["listLocationManagerOrganizations"]>().mockResolvedValue({
      items: [], nextCursor: "repeating_cursor",
    });
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({ organizations })))
      .rejects.toThrow("pagination did not advance");
    expect(organizations).toHaveBeenCalledTimes(2);
  });
});
