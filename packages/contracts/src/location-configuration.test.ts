import { describe, expect, it } from "vitest";

import {
  clearConfigurationOverrideRequestSchema,
  configurationMutationResponseSchema,
  locationConfigurationResponseSchema,
  setConfigurationOverrideRequestSchema,
} from "./location-configuration";

const token = "2026-08-22T00:00:00.000Z";

describe("Location configuration contracts", () => {
  it("accepts exactly the ten typed override variants", () => {
    const variants = [
      { setting: "checkInPhotosRequired", value: true },
      { setting: "handoffStandardMethodPolicy", value: "EITHER" },
      { setting: "trackingEnabled", value: false },
      { setting: "rawGpsRetentionDays", value: 30 },
      { setting: "valetServiceFee", value: "5.500" },
      { setting: "paymentServicePayer", value: "VENUE" },
      { setting: "paymentMethodsPolicy", value: "CASH_OR_DIGITAL" },
      { setting: "tipsEnabled", value: true },
      { setting: "validationEnabled", value: false },
      { setting: "releaseRequiresPayment", value: true },
    ].map((variant) => ({ ...variant, expectedUpdatedAt: token }));
    for (const variant of variants) {
      expect(setConfigurationOverrideRequestSchema.parse(variant)).toEqual(
        variant,
      );
    }
  });

  it("rejects unknown settings, wrong types and extra fields", () => {
    for (const invalid of [
      { setting: "operatingHours", value: true, expectedUpdatedAt: token },
      { setting: "tipsEnabled", value: "yes", expectedUpdatedAt: token },
      { setting: "rawGpsRetentionDays", value: 0, expectedUpdatedAt: token },
      { setting: "rawGpsRetentionDays", value: 1.5, expectedUpdatedAt: token },
      { setting: "valetServiceFee", value: "-1.000", expectedUpdatedAt: token },
      { setting: "valetServiceFee", value: 5, expectedUpdatedAt: token },
      { setting: "paymentServicePayer", value: "COMPANY", expectedUpdatedAt: token },
      { setting: "checkInPhotosRequired", value: true },
      {
        setting: "checkInPhotosRequired",
        value: true,
        expectedUpdatedAt: token,
        organizationId: crypto.randomUUID(),
      },
    ]) {
      expect(setConfigurationOverrideRequestSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  it("accepts only explicit clear requests with a token", () => {
    expect(
      clearConfigurationOverrideRequestSchema.parse({
        setting: "valetServiceFee",
        expectedUpdatedAt: token,
      }),
    ).toEqual({ setting: "valetServiceFee", expectedUpdatedAt: token });
    expect(
      clearConfigurationOverrideRequestSchema.safeParse({
        setting: "valetServiceFee",
        value: null,
        expectedUpdatedAt: token,
      }).success,
    ).toBe(false);
    expect(
      clearConfigurationOverrideRequestSchema.safeParse({
        setting: "timezone",
        expectedUpdatedAt: token,
      }).success,
    ).toBe(false);
  });

  it("keeps absent overrides distinct from explicit false in projections", () => {
    const response = locationConfigurationResponseSchema.parse({
      organizationId: crypto.randomUUID(),
      locationId: crypto.randomUUID(),
      timezone: "Asia/Amman",
      currency: "JOD",
      updatedAt: token,
      settings: [
        {
          setting: "checkInPhotosRequired",
          default: false,
          overridePresent: false,
          override: null,
          effective: false,
        },
        {
          setting: "trackingEnabled",
          default: false,
          overridePresent: true,
          override: false,
          effective: false,
        },
        {
          setting: "valetServiceFee",
          default: "0.000",
          overridePresent: true,
          override: "2.500",
          effective: "2.500",
        },
      ],
    });
    expect(response.settings[0]).toEqual({
      setting: "checkInPhotosRequired",
      default: false,
      overridePresent: false,
      override: null,
      effective: false,
    });
    expect(response.settings[1]?.override).toBe(false);
  });

  it("requires a post-mutation projection inside mutation responses", () => {
    const valid = {
      locationId: crypto.randomUUID(),
      updatedAt: token,
      result: {
        setting: "releaseRequiresPayment",
        default: false,
        overridePresent: true,
        override: true,
        effective: true,
      },
    };
    expect(configurationMutationResponseSchema.parse(valid)).toEqual(valid);
    expect(
      configurationMutationResponseSchema.safeParse({
        ...valid,
        result: { setting: "releaseRequiresPayment", override: true },
      }).success,
    ).toBe(false);
  });
});
