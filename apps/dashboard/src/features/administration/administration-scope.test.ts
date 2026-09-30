import { describe, expect, it } from "vitest";
import type { SelectedDashboardScope } from "../../components/scope";

import { administrationScopeKey } from "./administration-scope";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const location = {
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Main",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};

describe("Administration protected scope identity", () => {
  it("keys protected state to identity, session, and selection epoch", () => {
    const selectedScope: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN",
      context: {
        organization,
        scope: { kind: "LOCATION", locationId: location.locationId },
        selectedLocation: location,
        capabilities: [],
      },
    };
    const firstA = {
      identityGeneration: 7,
      sessionGeneration: 11,
      selectionRevision: 1,
      selectedScope,
    };

    expect(administrationScopeKey(firstA)).not.toBe(
      administrationScopeKey({ ...firstA, selectionRevision: 3 }),
    );
    expect(administrationScopeKey(firstA)).not.toBe(
      administrationScopeKey({ ...firstA, sessionGeneration: 12 }),
    );
    expect(administrationScopeKey(firstA)).not.toBe(
      administrationScopeKey({ ...firstA, identityGeneration: 8 }),
    );
  });
});
