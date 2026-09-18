import { describe, expect, it } from "vitest";

import {
  managementIntegrationsResponseSchema,
  managementSubscriptionResponseSchema,
} from "./index.js";

const organizationId = "11111111-1111-4111-8111-111111111111";

describe("management commercial contracts", () => {
  it("accepts only the persisted read-only subscription projection", () => {
    const value = {
      organizationId,
      subscription: {
        entitlements: {
          basicBranding: true,
          dashboardAccess: false,
          reportExports: true,
        },
        planCode: "ENTERPRISE_ULTRA_WHATEVER",
        status: "SUSPENDED",
      },
    };
    expect(managementSubscriptionResponseSchema.parse(value)).toEqual(value);
    expect(
      managementSubscriptionResponseSchema.parse({
        organizationId,
        subscription: null,
      }).subscription,
    ).toBeNull();
    expect(() =>
      managementSubscriptionResponseSchema.parse({
        ...value,
        price: "10.00",
      }),
    ).toThrow();
  });

  it("accepts only the fixed integration catalog and safe statuses", () => {
    const value = {
      organizationId,
      integrations: [
        { key: "PLATE_OCR", status: "UNKNOWN" },
        { key: "STAFF_PUSH", status: "DISABLED" },
        { key: "DIGITAL_PAYMENT", status: "UNAVAILABLE" },
      ],
    };
    expect(managementIntegrationsResponseSchema.parse(value)).toEqual(value);
    expect(() =>
      managementIntegrationsResponseSchema.parse({
        ...value,
        integrations: [
          ...value.integrations,
          { key: "SSO", status: "OPERATIONAL" },
        ],
      }),
    ).toThrow();
    expect(() =>
      managementIntegrationsResponseSchema.parse({
        ...value,
        integrations: [
          { key: "PLATE_OCR", status: "UNKNOWN", endpoint: "https://secret" },
          value.integrations[1],
          value.integrations[2],
        ],
      }),
    ).toThrow();
  });
});
