import { describe, expect, it } from "vitest";

import {
  staffOperationalContextResponseSchema,
  staffOperationalMembershipContextSchema,
  staffOperationalRoleSchema,
} from "./staff-context";

const MOCK_LOCATION_ID_1 = "11111111-1111-4111-8111-111111111111";
const MOCK_LOCATION_ID_2 = "22222222-2222-4222-8222-222222222222";
const MOCK_ORG_ID = "33333333-3333-4333-8333-333333333333";
const MOCK_MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const MOCK_SHIFT_ID = "55555555-5555-4555-8555-555555555555";

describe("Staff Operational Context Contracts", () => {
  it("validates operational roles and rejects non-operational roles", () => {
    expect(staffOperationalRoleSchema.parse("VALET_EMPLOYEE")).toBe(
      "VALET_EMPLOYEE",
    );
    expect(staffOperationalRoleSchema.parse("VALET_SUPERVISOR")).toBe(
      "VALET_SUPERVISOR",
    );
    expect(() =>
      staffOperationalRoleSchema.parse("LOCATION_MANAGER"),
    ).toThrow();
    expect(() => staffOperationalRoleSchema.parse("ORG_ADMIN")).toThrow();
  });

  it("parses valid operational membership context with active shift", () => {
    const rawContext = {
      membershipId: MOCK_MEMBERSHIP_ID,
      organization: {
        organizationId: MOCK_ORG_ID,
        name: "Grand Valet Operations",
      },
      role: "VALET_EMPLOYEE",
      activeShift: {
        shiftId: MOCK_SHIFT_ID,
        locationId: MOCK_LOCATION_ID_1,
        startedAt: "2026-08-21T03:00:00.000Z",
        status: "ACTIVE",
      },
      currentLocation: {
        locationId: MOCK_LOCATION_ID_1,
        name: "Main Entrance",
        code: "MAIN",
      },
      eligibleLocations: [
        {
          locationId: MOCK_LOCATION_ID_1,
          name: "Main Entrance",
          code: "MAIN",
        },
        {
          locationId: MOCK_LOCATION_ID_2,
          name: "VIP Lounge",
          code: "VIP",
        },
      ],
    };

    const parsed = staffOperationalMembershipContextSchema.parse(rawContext);
    expect(parsed.membershipId).toBe(MOCK_MEMBERSHIP_ID);
    expect(parsed.activeShift?.status).toBe("ACTIVE");
    expect(parsed.currentLocation?.locationId).toBe(MOCK_LOCATION_ID_1);
    expect(parsed.eligibleLocations).toHaveLength(2);
  });

  it("parses valid operational membership context without active shift", () => {
    const rawContext = {
      membershipId: MOCK_MEMBERSHIP_ID,
      organization: {
        organizationId: MOCK_ORG_ID,
        name: "Grand Valet Operations",
      },
      role: "VALET_SUPERVISOR",
      activeShift: null,
      currentLocation: null,
      eligibleLocations: [
        {
          locationId: MOCK_LOCATION_ID_1,
          name: "Main Entrance",
          code: "MAIN",
        },
      ],
    };

    const parsed = staffOperationalMembershipContextSchema.parse(rawContext);
    expect(parsed.activeShift).toBeNull();
    expect(parsed.currentLocation).toBeNull();
    expect(parsed.eligibleLocations).toHaveLength(1);
  });

  it("parses full operational context response with multi-organization support", () => {
    const response = {
      contexts: [
        {
          membershipId: MOCK_MEMBERSHIP_ID,
          organization: {
            organizationId: MOCK_ORG_ID,
            name: "Org A",
          },
          role: "VALET_EMPLOYEE",
          activeShift: null,
          currentLocation: null,
          eligibleLocations: [],
        },
      ],
    };

    const parsed = staffOperationalContextResponseSchema.parse(response);
    expect(parsed.contexts).toHaveLength(1);
  });

  it("rejects unknown extra properties due to strict validation", () => {
    const responseWithPii = {
      contexts: [],
      email: "valet@example.com",
      userId: MOCK_MEMBERSHIP_ID,
    };

    expect(() =>
      staffOperationalContextResponseSchema.parse(responseWithPii),
    ).toThrow();
  });
});
