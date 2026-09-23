import type {
  CompanyAnalyticsResponse,
  FinancialAnalyticsResponse,
  IncidentAnalyticsResponse,
  LocationKpiAnalyticsResponse,
  OperationalAnalyticsResponse,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { analyticsCopy } from "./analytics-copy";
import {
  companyAnalyticsPresentation,
  companyEvidenceLocationCount,
  companySlaEvidence,
  handoffEvidence,
  locationAnalyticsPresentation,
  validateAnalyticsPeriod,
} from "./analytics-presentation";

const locationId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const period = { from: "2026-09-01", to: "2026-09-02" };

const operations: OperationalAnalyticsResponse = {
  locationId,
  timezone: "Asia/Amman",
  ...period,
  metrics: {
    checkInTime: { sampleCount: 2, averageSeconds: "11.125" },
    parkingTime: { sampleCount: 2, averageSeconds: "22.250" },
    retrievalWait: { sampleCount: 3, averageSeconds: "33.375" },
    retrievalStartLatencyAuxiliary: { sampleCount: 4, averageSeconds: "444.500" },
    handoffTime: { sampleCount: 5, averageSeconds: "55.625" },
  },
  carsHandledPerDay: [
    { date: "2026-09-01", handledCount: 7 },
    { date: "2026-09-02", handledCount: 0 },
  ],
};

const financial: FinancialAnalyticsResponse = {
  locationId,
  timezone: "Asia/Amman",
  ...period,
  currencies: [
    {
      currency: "JOD",
      paidPaymentCount: 7,
      collectedAmountTotal: "12345678901234567890.123",
      tipAmountTotal: "7.777",
      digitalPaymentRate: { numerator: 3, denominator: 7, percentage: "42.86" },
      succeededRefundAmountTotal: "1.111",
      validationRate: { numerator: 0, denominator: 0, percentage: null },
      currentValidationAmountTotal: "4.444",
    },
    {
      currency: "USD",
      paidPaymentCount: 2,
      collectedAmountTotal: "20.456",
      tipAmountTotal: "0.000",
      digitalPaymentRate: { numerator: 0, denominator: 0, percentage: null },
      succeededRefundAmountTotal: "0.000",
      validationRate: { numerator: 1, denominator: 2, percentage: "50.00" },
      currentValidationAmountTotal: "0.000",
    },
  ],
  cashReconciliation: [{
    currency: "JOD",
    cashExpectedTotal: "5.000",
    cashReportedTotal: "4.000",
    cashVarianceTotal: "-1.000",
  }],
};

const incidents: IncidentAnalyticsResponse = {
  locationId,
  timezone: "Asia/Amman",
  ...period,
  incidentCount: 4,
  severityCounts: [{ severity: "LOW", count: 4 }],
  typeCounts: [{ type: "DAMAGE", count: 4 }],
  incidentsPer1000: { numerator: 4, denominator: 0, value: null },
};

const kpis: LocationKpiAnalyticsResponse = {
  locationId,
  timezone: "Asia/Amman",
  ...period,
  slaCompliance: {
    numerator: 8,
    denominator: 10,
    percentage: "80.00",
    missingTargetCount: 2,
    invalidOrMissingIntervalCount: 3,
  },
  carsPerActiveEmployee: { numerator: 17, denominator: 4, value: "4.250" },
  carsHandedOffByEmployee: {
    attributedCount: 10,
    employeeCount: 2,
    missingAttributionCount: 7,
    truncated: true,
    byEmployee: [{ membershipId: "membership-1", count: 10 }],
  },
  keyExceptions: {
    count: 10,
    byType: [
      { type: "KEY_MISSING", count: 1 },
      { type: "WRONG_KEY", count: 2 },
      { type: "KEY_DAMAGED", count: 3 },
      { type: "KEY_LOCKED_INSIDE", count: 4 },
    ],
  },
};

function companyResponse(): CompanyAnalyticsResponse {
  return {
    organizationId,
    ...period,
    summary: {
      coverage: {
        totalLocationCount: 3,
        activeLocationCount: 2,
        inactiveLocationCount: 1,
        timezoneBoundaries: [
          {
            timezone: "America/New_York",
            locationCount: 1,
            activeLocationCount: 1,
            inactiveLocationCount: 0,
            periodStartUtc: "2026-09-01T04:00:00.000Z",
            periodEndUtc: "2026-09-03T04:00:00.000Z",
          },
          {
            timezone: "Asia/Amman",
            locationCount: 2,
            activeLocationCount: 1,
            inactiveLocationCount: 1,
            periodStartUtc: "2026-08-31T21:00:00.000Z",
            periodEndUtc: "2026-09-02T21:00:00.000Z",
          },
        ],
      },
      operational: {
        metrics: Object.fromEntries(
          Object.entries(operations.metrics).map(([key, value], index) => [
            key,
            { ...value, contributingLocationCount: index + 1 },
          ]),
        ) as CompanyAnalyticsResponse["summary"]["operational"]["metrics"],
        carsHandledPerDay: operations.carsHandledPerDay,
      },
      financial: {
        currencies: financial.currencies,
        cashReconciliation: financial.cashReconciliation,
      },
      incidents: {
        incidentCount: incidents.incidentCount,
        severityCounts: incidents.severityCounts,
        typeCounts: incidents.typeCounts,
        incidentsPer1000: incidents.incidentsPer1000,
      },
      kpis: {
        slaCompliance: {
          ...kpis.slaCompliance,
          contributingLocationCount: 2,
          requestCount: 12,
        },
        carsPerActiveEmployee: {
          ...kpis.carsPerActiveEmployee,
          evidenceLocationCount: 2,
        },
        carsHandedOff: {
          attributedCount: 10,
          missingAttributionCount: 7,
          distinctAttributedEmployeeCount: 2,
        },
        keyExceptions: kpis.keyExceptions,
      },
    },
  };
}

describe("MD-05C Analytics period validation", () => {
  it("accepts canonical real dates through 31 inclusive days without timezone math", () => {
    expect(validateAnalyticsPeriod("2026-09-01", "2026-10-01")).toEqual({
      kind: "valid",
      period: { from: "2026-09-01", to: "2026-10-01" },
    });
    expect(validateAnalyticsPeriod("2026-03-08", "2026-03-09")).toMatchObject({ kind: "valid" });
  });

  it("rejects missing, malformed, impossible, reversed and 32-day periods", () => {
    expect(validateAnalyticsPeriod(null, null).kind).toBe("required");
    expect(validateAnalyticsPeriod("09/01/2026", "2026-09-02").kind).toBe("invalid-date");
    expect(validateAnalyticsPeriod("0099-01-01", "0099-01-01").kind).toBe("invalid-date");
    expect(validateAnalyticsPeriod("2026-02-30", "2026-03-01").kind).toBe("invalid-date");
    expect(validateAnalyticsPeriod("2026-09-02", "2026-09-01").kind).toBe("reversed");
    expect(validateAnalyticsPeriod("2026-09-01", "2026-10-02").kind).toBe("too-long");
  });
});

describe("MD-05C Location Analytics presentation", () => {
  it("maps all five duration families with official Retrieval Wait kept distinct", () => {
    const result = locationAnalyticsPresentation(operations, financial, incidents, kpis);
    expect(result.durations.map(({ key }) => key)).toEqual([
      "checkInTime",
      "parkingTime",
      "retrievalWait",
      "retrievalStartLatencyAuxiliary",
      "handoffTime",
    ]);
    expect(result.durations[2]).toMatchObject({ sampleCount: 3, averageSeconds: "33.375" });
    expect(result.durations[3]).toMatchObject({ sampleCount: 4, averageSeconds: "444.500" });
  });

  it("preserves no-sample nulls, empty activity and returned zero days without fallback", () => {
    const noSamples = {
      ...operations,
      metrics: { ...operations.metrics, retrievalWait: { sampleCount: 0, averageSeconds: null } },
      carsHandledPerDay: [],
    };
    const result = locationAnalyticsPresentation(noSamples, financial, incidents, kpis);
    expect(result.durations[2]).toMatchObject({ sampleCount: 0, averageSeconds: null });
    expect(result.activity).toEqual([]);
    expect(locationAnalyticsPresentation(operations, financial, incidents, kpis).activity[1]?.handledCount).toBe(0);
  });

  it("keeps currencies, exact decimals, signed cash and returned rate evidence unchanged", () => {
    const result = locationAnalyticsPresentation(operations, financial, incidents, kpis);
    expect(result.financial.currencies.map(({ currency }) => currency)).toEqual(["JOD", "USD"]);
    expect(result.financial.currencies[0]?.collectedAmountTotal).toBe("12345678901234567890.123");
    expect(result.financial.currencies[0]).not.toHaveProperty("cashVarianceTotal");
    expect(result.financial.cashReconciliation[0]?.cashVarianceTotal).toBe("-1.000");
    expect(result.financial.currencies[0]?.validationRate).toEqual({ numerator: 0, denominator: 0, percentage: null });
    expect(result.financial.currencies[1]?.digitalPaymentRate.percentage).toBeNull();
    expect(result.financial).not.toHaveProperty("total");
  });

  it("keeps incident, SLA, workforce, handoff and four controlled Key Exception evidence direct", () => {
    const result = locationAnalyticsPresentation(operations, financial, incidents, kpis);
    expect(result.incidents.incidentCount).toBe(4);
    expect(result.incidents.incidentsPer1000).toEqual({ numerator: 4, denominator: 0, value: null });
    expect(result.slaCompliance).toEqual(kpis.slaCompliance);
    expect(result.carsPerActiveEmployee).toEqual(kpis.carsPerActiveEmployee);
    expect(handoffEvidence(result)).toEqual({ attributedCount: 10, missingAttributionCount: 7, employeeEvidenceCount: 2, truncated: true });
    expect(result.handoff).not.toHaveProperty("byEmployee");
    expect(result.keyExceptions.byType.map(({ type }) => type)).toEqual([
      "KEY_MISSING", "WRONG_KEY", "KEY_DAMAGED", "KEY_LOCKED_INSIDE",
    ]);
  });
});

describe("MD-05C Company Analytics presentation", () => {
  it("uses one Company DTO verbatim for source-recomputed facts and ordered coverage", () => {
    const source = companyResponse();
    const result = companyAnalyticsPresentation(source);
    expect(result.activity).toBe(source.summary.operational.carsHandledPerDay);
    expect(result.financial).toBe(source.summary.financial);
    expect(result.coverage).toBe(source.summary.coverage);
    expect(result.coverage?.timezoneBoundaries.map(({ timezone }) => timezone)).toEqual([
      "America/New_York", "Asia/Amman",
    ]);
    expect(result.coverage?.timezoneBoundaries[0]?.periodStartUtc).toBe("2026-09-01T04:00:00.000Z");
  });

  it("preserves Company evidence counts without Location fan-out or employee rankings", () => {
    const result = companyAnalyticsPresentation(companyResponse());
    expect(companyEvidenceLocationCount(result)).toBe(2);
    expect(companySlaEvidence(result)).toEqual({ contributingLocationCount: 2, requestCount: 12 });
    expect(handoffEvidence(result)).toEqual({
      attributedCount: 10,
      missingAttributionCount: 7,
      employeeEvidenceCount: 2,
      truncated: false,
    });
    expect(result.handoff).not.toHaveProperty("byEmployee");
    expect(result).not.toHaveProperty("locations");
    expect(result).not.toHaveProperty("organizationTimezone");
  });

  it("contains no prototype Guest, Returning Contact, trend, Revenue series or performance concepts", () => {
    const result = companyAnalyticsPresentation(companyResponse());
    for (const forbidden of ["guestSatisfaction", "returningContact", "trend", "revenueSeries", "employeeRanking", "performanceScore"]) {
      expect(result).not.toHaveProperty(forbidden);
    }
    for (const locale of ["en", "ar"] as const) {
      const copy = analyticsCopy(locale);
      expect(copy).not.toHaveProperty("guestSatisfaction");
      expect(copy).not.toHaveProperty("returningContact");
    }
  });
});
