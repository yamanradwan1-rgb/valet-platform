import { describe, expect, it } from "vitest";
import type { SelectedDashboardScope } from "../../components/scope";

import { hasExactActiveLocation, operationsScope, operationsScopeKey } from "./operations-scope";

const organization = { organizationId: "11111111-1111-4111-8111-111111111111", name: "Org", timezone: "Asia/Amman" };
const location = {
  locationId: "22222222-2222-4222-8222-222222222222", name: "Main", code: "MAIN",
  status: "ACTIVE" as const, timezone: "Asia/Amman", currency: "JOD",
};

describe("MD-03 exact scope", () => {
  it("rejects CA All Locations and admits exact active CA/LM scopes", () => {
    const all: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN",
      context: { organization, scope: { kind: "ALL_LOCATIONS" }, selectedLocation: null, capabilities: [] },
    };
    const exact: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN",
      context: {
        organization, scope: { kind: "LOCATION", locationId: location.locationId },
        selectedLocation: location, capabilities: [],
      },
    };
    const lm: SelectedDashboardScope = { authority: "LOCATION_MANAGER", organization, location };
    const lmGrantSet: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER_GRANT_SET", organization,
    };
    expect(hasExactActiveLocation(operationsScope(all))).toBe(false);
    expect(hasExactActiveLocation(operationsScope(exact))).toBe(true);
    expect(hasExactActiveLocation(operationsScope(lm))).toBe(true);
    expect(operationsScope(lmGrantSet)).toMatchObject({
      authority: "LOCATION_MANAGER", locationId: null, locationStatus: null,
    });
  });

  it("keys page state to identity, session, selection epoch, authority, and exact Location", () => {
    const lm: SelectedDashboardScope = { authority: "LOCATION_MANAGER", organization, location };
    const base = {
      identityGeneration: 7,
      sessionGeneration: 11,
      selectionRevision: 2,
      selectedScope: lm,
    };
    expect(operationsScopeKey(base)).not.toBe(operationsScopeKey({ ...base, identityGeneration: 8 }));
    expect(operationsScopeKey(base)).not.toBe(operationsScopeKey({ ...base, sessionGeneration: 12 }));
    expect(operationsScopeKey(base)).not.toBe(operationsScopeKey({ ...base, selectionRevision: 3 }));
  });
});
