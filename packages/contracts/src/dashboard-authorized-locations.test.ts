import { describe, expect, it } from "vitest";

import {
  dashboardAuthorizedLocationSchema,
  dashboardAuthorizedLocationsResponseSchema,
} from "./dashboard-authorized-locations";

const validLocation = {
  locationId: "11111111-1111-4111-8111-111111111111",
  name: "Alpha Hotel",
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  currency: "JOD",
  timezone: "Asia/Amman",
};

describe("dashboard authorized-locations contract", () => {
  it("accepts the exact authorized-location projection", () => {
    const parsed = dashboardAuthorizedLocationSchema.parse(validLocation);
    expect(Object.keys(parsed).sort()).toEqual(
      ["currency", "locationId", "name", "organizationId", "timezone"].sort(),
    );
  });

  it("rejects unknown fields (no invented metadata)", () => {
    const result = dashboardAuthorizedLocationSchema.safeParse({
      ...validLocation,
      address: "Invented street 1",
      organizationName: "Invented Org",
      statusBadge: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing or malformed fields", () => {
    for (const key of [
      "locationId",
      "name",
      "organizationId",
      "currency",
      "timezone",
    ] as const) {
      const partial: Record<string, unknown> = { ...validLocation };
      delete partial[key];
      expect(
        dashboardAuthorizedLocationSchema.safeParse(partial).success,
        key,
      ).toBe(false);
    }
    expect(
      dashboardAuthorizedLocationSchema.safeParse({
        ...validLocation,
        locationId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      dashboardAuthorizedLocationSchema.safeParse({
        ...validLocation,
        currency: "jod",
      }).success,
    ).toBe(false);
    expect(
      dashboardAuthorizedLocationSchema.safeParse({
        ...validLocation,
        currency: "JODX",
      }).success,
    ).toBe(false);
    expect(
      dashboardAuthorizedLocationSchema.safeParse({
        ...validLocation,
        name: "",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty locations list as a valid no-access response", () => {
    expect(
      dashboardAuthorizedLocationsResponseSchema.parse({ locations: [] }),
    ).toEqual({ locations: [] });
  });

  it("keeps the response envelope strict and ordered data agnostic", () => {
    const response = {
      locations: [validLocation, { ...validLocation, name: "Beta Mall" }],
    };
    const parsed = dashboardAuthorizedLocationsResponseSchema.parse(response);
    expect(parsed.locations).toHaveLength(2);
    const extra = dashboardAuthorizedLocationsResponseSchema.safeParse({
      locations: [],
      nextCursor: "sneaky",
    });
    expect(extra.success).toBe(false);
  });
});
