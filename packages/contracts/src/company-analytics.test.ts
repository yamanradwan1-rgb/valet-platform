import { describe, expect, it } from "vitest";

import {
  companyAnalyticsCoverageSchema,
  companyAnalyticsResponseSchema,
  type CompanyAnalyticsResponse,
  type CompanyAnalyticsSummary,
} from "./company-analytics.js";

const organizationId = "11111111-1111-4111-8111-111111111111";

const keyTypes = [
  "KEY_MISSING",
  "WRONG_KEY",
  "KEY_DAMAGED",
  "KEY_LOCKED_INSIDE",
] as const;

function duration(): {
  averageSeconds: string | null;
  contributingLocationCount: number;
  sampleCount: number;
} {
  return {
    averageSeconds: null,
    contributingLocationCount: 0,
    sampleCount: 0,
  };
}

function summary(): CompanyAnalyticsSummary {
  return {
    coverage: {
      activeLocationCount: 1,
      inactiveLocationCount: 1,
      timezoneBoundaries: [
        {
          activeLocationCount: 1,
          inactiveLocationCount: 0,
          locationCount: 1,
          periodEndUtc: "2026-09-03T21:00:00.000Z",
          periodStartUtc: "2026-08-31T21:00:00.000Z",
          timezone: "Asia/Amman",
        },
        {
          activeLocationCount: 0,
          inactiveLocationCount: 1,
          locationCount: 1,
          periodEndUtc: "2026-09-04T04:00:00.000Z",
          periodStartUtc: "2026-09-01T04:00:00.000Z",
          timezone: "America/New_York",
        },
      ].sort((left, right) => left.timezone.localeCompare(right.timezone)),
      totalLocationCount: 2,
    },
    operational: {
      carsHandledPerDay: [],
      metrics: {
        checkInTime: duration(),
        handoffTime: duration(),
        parkingTime: duration(),
        retrievalStartLatencyAuxiliary: duration(),
        retrievalWait: duration(),
      },
    },
    financial: { cashReconciliation: [], currencies: [] },
    incidents: {
      incidentCount: 0,
      incidentsPer1000: { denominator: 0, numerator: 0, value: null },
      severityCounts: [],
      typeCounts: [],
    },
    kpis: {
      carsHandedOff: {
        attributedCount: 0,
        distinctAttributedEmployeeCount: 0,
        missingAttributionCount: 0,
      },
      carsPerActiveEmployee: {
        denominator: 0,
        evidenceLocationCount: 0,
        numerator: 0,
        value: null,
      },
      keyExceptions: {
        byType: keyTypes.map((type) => ({ count: 0, type })),
        count: 0,
      },
      slaCompliance: {
        contributingLocationCount: 0,
        denominator: 0,
        invalidOrMissingIntervalCount: 0,
        missingTargetCount: 0,
        numerator: 0,
        percentage: null,
        requestCount: 0,
      },
    },
  };
}

function response(): CompanyAnalyticsResponse {
  return {
    from: "2026-09-01",
    organizationId,
    summary: summary(),
    to: "2026-09-03",
  };
}

describe("MGT-BE-11 company analytics contracts", () => {
  it("accepts truthful empty-sample null metrics with explicit coverage", () => {
    expect(companyAnalyticsResponseSchema.parse(response())).toEqual(response());
  });

  it("accepts weighted aggregate values without a staff breakdown", () => {
    const value = response();
    value.summary.operational.metrics.retrievalWait = {
      averageSeconds: "75.000",
      contributingLocationCount: 2,
      sampleCount: 4,
    };
    value.summary.kpis.slaCompliance = {
      contributingLocationCount: 2,
      denominator: 3,
      invalidOrMissingIntervalCount: 1,
      missingTargetCount: 2,
      numerator: 2,
      percentage: "66.67",
      requestCount: 6,
    };
    value.summary.kpis.carsPerActiveEmployee = {
      denominator: 4,
      evidenceLocationCount: 2,
      numerator: 9,
      value: "2.250",
    };
    value.summary.kpis.carsHandedOff = {
      attributedCount: 8,
      distinctAttributedEmployeeCount: 3,
      missingAttributionCount: 1,
    };
    expect(companyAnalyticsResponseSchema.parse(value)).toEqual(value);
    expect(value.summary.kpis.carsHandedOff).not.toHaveProperty("byEmployee");
  });

  it.each([
    (value: ReturnType<typeof response>) => ({ ...value, unexpected: true }),
    (value: ReturnType<typeof response>) => ({
      ...value,
      summary: { ...value.summary, guestRating: { average: "5.000" } },
    }),
    (value: ReturnType<typeof response>) => ({
      ...value,
      summary: { ...value.summary, returningContact: { count: 1 } },
    }),
    (value: ReturnType<typeof response>) => ({
      ...value,
      summary: {
        ...value.summary,
        kpis: {
          ...value.summary.kpis,
          carsHandedOff: {
            ...value.summary.kpis.carsHandedOff,
            byEmployee: [{ count: 1, membershipId: organizationId }],
          },
        },
      },
    }),
    (value: ReturnType<typeof response>) => ({
      ...value,
      summary: {
        ...value.summary,
        operational: {
          ...value.summary.operational,
          metrics: {
            ...value.summary.operational.metrics,
            checkInTime: {
              ...value.summary.operational.metrics.checkInTime,
              averageSeconds: "0",
            },
          },
        },
      },
    }),
  ])("rejects widened or malformed aggregate shapes", (mutate) => {
    expect(companyAnalyticsResponseSchema.safeParse(mutate(response())).success).toBe(false);
  });

  it("requires deterministic timezone coverage ordering", () => {
    const coverage = summary().coverage;
    expect(companyAnalyticsCoverageSchema.safeParse(coverage).success).toBe(true);
    expect(
      companyAnalyticsCoverageSchema.safeParse({
        ...coverage,
        timezoneBoundaries: [...coverage.timezoneBoundaries].reverse(),
      }).success,
    ).toBe(false);
  });

  it("bounds timezone and incident type group arrays at 500", () => {
    const timezoneBoundaries = Array.from({ length: 501 }, (_, index) => ({
      activeLocationCount: 1,
      inactiveLocationCount: 0,
      locationCount: 1,
      periodEndUtc: "2026-09-02T00:00:00.000Z",
      periodStartUtc: "2026-09-01T00:00:00.000Z",
      timezone: `Zone/${index.toString().padStart(3, "0")}`,
    }));
    expect(
      companyAnalyticsCoverageSchema.safeParse({
        activeLocationCount: 501,
        inactiveLocationCount: 0,
        timezoneBoundaries,
        totalLocationCount: 501,
      }).success,
    ).toBe(false);

    const value = response();
    value.summary.incidents.typeCounts = Array.from({ length: 501 }, (_, index) => ({
      count: 1,
      type: `TYPE_${index}`,
    }));
    expect(companyAnalyticsResponseSchema.safeParse(value).success).toBe(false);
  });
});
