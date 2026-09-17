import { describe, expect, it } from "vitest";

import { locationKpiAnalyticsResponseSchema } from "./location-analytics-kpis.js";

const base = {
  carsHandedOffByEmployee: {
    attributedCount: 0,
    byEmployee: [],
    employeeCount: 0,
    missingAttributionCount: 0,
    truncated: false,
  },
  carsPerActiveEmployee: { denominator: 0, numerator: 0, value: null },
  from: "2026-09-01",
  keyExceptions: {
    byType: [
      { count: 0, type: "KEY_MISSING" },
      { count: 0, type: "WRONG_KEY" },
      { count: 0, type: "KEY_DAMAGED" },
      { count: 0, type: "KEY_LOCKED_INSIDE" },
    ],
    count: 0,
  },
  locationId: "11111111-1111-4111-8111-111111111111",
  slaCompliance: {
    denominator: 0,
    invalidOrMissingIntervalCount: 0,
    missingTargetCount: 0,
    numerator: 0,
    percentage: null,
  },
  timezone: "Asia/Amman",
  to: "2026-09-02",
} as const;

describe("MGT-BE-10 KPI analytics contract", () => {
  it("accepts explicit zero-coverage null ratios and bounded handoff rows", () => {
    expect(locationKpiAnalyticsResponseSchema.parse(base)).toEqual(base);
    const populated = {
      ...base,
      carsHandedOffByEmployee: {
        attributedCount: 1,
        byEmployee: [{ count: 1, membershipId: "22222222-2222-4222-8222-222222222222" }],
        employeeCount: 1,
        missingAttributionCount: 1,
        truncated: false,
      },
      carsPerActiveEmployee: { denominator: 2, numerator: 3, value: "1.500" },
      slaCompliance: {
        denominator: 2,
        invalidOrMissingIntervalCount: 1,
        missingTargetCount: 1,
        numerator: 1,
        percentage: "50.00",
      },
    };
    expect(locationKpiAnalyticsResponseSchema.parse(populated)).toEqual(populated);
  });

  it.each([
    { ...base, unexpected: true },
    { ...base, slaCompliance: { ...base.slaCompliance, percentage: "0" } },
    { ...base, carsPerActiveEmployee: { denominator: 0, numerator: 0, value: "0" } },
    { ...base, keyExceptions: { count: 0, byType: base.keyExceptions.byType.slice(0, 3) } },
  ])("rejects malformed or widened response shapes", (value) => {
    expect(locationKpiAnalyticsResponseSchema.safeParse(value).success).toBe(false);
  });
});
