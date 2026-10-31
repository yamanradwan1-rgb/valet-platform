import { describe, expect, it } from "vitest";
import type { SelectedDashboardScope } from "../../../../../components/scope";
import { presenceStudioAccess, presenceStudioScopeKey } from "./presence-scope";

const company = (status: "ACTIVE" | "INACTIVE" | null) => ({
  authority: "COMPANY_ADMIN",
  context: {
    organization: { organizationId: "org-one" },
    scope: status ? { kind: "LOCATION", locationId: "loc-one" }
      : { kind: "ALL_LOCATIONS" },
    selectedLocation: status
      ? { locationId: "loc-one", status } : null,
  },
}) as unknown as SelectedDashboardScope;

const manager = (status: "ACTIVE" | "INACTIVE") => ({
  authority: "LOCATION_MANAGER",
  organization: { organizationId: "org-one" },
  location: { locationId: "loc-one", status },
}) as unknown as SelectedDashboardScope;

describe("Policies Studio presence route gate", () => {
  it("requires an exact active location for Location policy and zones", () => {
    expect(presenceStudioAccess(company(null), false)).toBe("NO_LOCATION");
    expect(presenceStudioAccess(company("INACTIVE"), false))
      .toBe("INACTIVE_LOCATION");
    expect(presenceStudioAccess(company("ACTIVE"), false))
      .toBe("REQUESTABLE");
    expect(presenceStudioAccess(manager("INACTIVE"), false))
      .toBe("INACTIVE_LOCATION");
    expect(presenceStudioAccess(manager("ACTIVE"), false))
      .toBe("REQUESTABLE");
  });

  it("keeps Company policy distinct from LM and Supervisor authority", () => {
    expect(presenceStudioAccess(company(null), true)).toBe("REQUESTABLE");
    expect(presenceStudioAccess(manager("ACTIVE"), true)).toBe("DENIED");
    const supervisor = { authority: "SUPERVISOR" } as SelectedDashboardScope;
    const grantSet = {
      authority: "LOCATION_MANAGER_GRANT_SET",
    } as SelectedDashboardScope;
    expect(presenceStudioAccess(supervisor, false)).toBe("DENIED");
    expect(presenceStudioAccess(grantSet, false)).toBe("DENIED");
  });

  it("keys remounts to selected location, role and identity revisions", () => {
    const baseline = {
      sessionGeneration: 1, identityGeneration: 1,
      selectionRevision: 1, selectedScope: company("ACTIVE"),
    };
    const key = presenceStudioScopeKey(baseline, false);
    expect(presenceStudioScopeKey({
      ...baseline, selectionRevision: 2,
    }, false)).not.toBe(key);
    expect(presenceStudioScopeKey({
      ...baseline, selectedScope: manager("ACTIVE"),
    }, false)).not.toBe(key);
    expect(presenceStudioScopeKey(baseline, true)).not.toBe(key);
  });
});
