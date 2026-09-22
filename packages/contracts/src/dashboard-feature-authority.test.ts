import { describe, expect, it } from "vitest";

import {
  dashboardFeatureAuthorityQuerySchema,
  dashboardFeatureAuthorityResponseSchema,
} from "./dashboard-feature-authority.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";

describe("dashboard feature authority contract", () => {
  it("keeps Visit Contacts Organization-scoped", () => {
    expect(dashboardFeatureAuthorityQuerySchema.parse({
      feature: "VISIT_CONTACTS",
      organizationId,
    })).toEqual({ feature: "VISIT_CONTACTS", organizationId });
    expect(() => dashboardFeatureAuthorityQuerySchema.parse({
      feature: "VISIT_CONTACTS",
      organizationId,
      locationId,
    })).toThrow();
  });

  it("allows Audit Organization or exact-Location authority queries", () => {
    expect(dashboardFeatureAuthorityQuerySchema.parse({
      feature: "MANAGEMENT_AUDIT",
      organizationId,
    })).toEqual({ feature: "MANAGEMENT_AUDIT", organizationId });
    expect(dashboardFeatureAuthorityQuerySchema.parse({
      feature: "MANAGEMENT_AUDIT",
      organizationId,
      locationId,
    })).toEqual({ feature: "MANAGEMENT_AUDIT", organizationId, locationId });
  });

  it("accepts only truthful role/scope projections", () => {
    for (const value of [
      {
        feature: "VISIT_CONTACTS",
        organizationId,
        role: "ORG_ADMIN",
        scope: { kind: "ORGANIZATION" },
      },
      {
        feature: "VISIT_CONTACTS",
        organizationId,
        role: "LOCATION_MANAGER",
        scope: { kind: "ORGANIZATION_GRANT_SET" },
      },
      {
        feature: "MANAGEMENT_AUDIT",
        organizationId,
        role: "LOCATION_MANAGER",
        scope: { kind: "LOCATION", locationId },
      },
      {
        feature: "MANAGEMENT_AUDIT",
        organizationId,
        role: "VALET_SUPERVISOR",
        scope: { kind: "LOCATION", locationId },
      },
    ]) {
      expect(dashboardFeatureAuthorityResponseSchema.safeParse(value).success).toBe(true);
    }
    expect(dashboardFeatureAuthorityResponseSchema.safeParse({
      feature: "MANAGEMENT_AUDIT",
      organizationId,
      role: "LOCATION_MANAGER",
      scope: { kind: "ORGANIZATION" },
    }).success).toBe(false);
  });
});
