import type {
  CompanyAnalyticsResponse,
  IncidentAnalyticsResponse,
  LocationKpiAnalyticsResponse,
  OperationalAnalyticsResponse,
  QueueSnapshotResponse,
  SessionStateCountsResponse,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { overviewCopy } from "./overview-copy";
import {
  companyOverviewPresentation,
  locationCurrentPresentation,
  locationOverviewPresentation,
} from "./overview-presentation";

const locationId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const period = { from: "2026-09-01", to: "2026-09-02" };

const operations: OperationalAnalyticsResponse = {
  locationId,
  timezone: "Asia/Amman",
  ...period,
  metrics: {
    checkInTime: { sampleCount: 1, averageSeconds: "11.000" },
    parkingTime: { sampleCount: 1, averageSeconds: "22.000" },
    retrievalWait: { sampleCount: 7, averageSeconds: "33.125" },
    retrievalStartLatencyAuxiliary: { sampleCount: 99, averageSeconds: "999.000" },
    handoffTime: { sampleCount: 1, averageSeconds: "44.000" },
  },
  carsHandledPerDay: [
    { date: "2026-09-01", handledCount: 5 },
    { date: "2026-09-02", handledCount: 0 },
  ],
};

const incidents: IncidentAnalyticsResponse = {
  locationId,
  timezone: "Asia/Amman",
  ...period,
  incidentCount: 4,
  severityCounts: [{ severity: "LOW", count: 4 }],
  typeCounts: [{ type: "DAMAGE", count: 4 }],
  incidentsPer1000: { numerator: 4, denominator: 17, value: "235.294" },
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
    truncated: false,
    byEmployee: [],
  },
  keyExceptions: {
    count: 0,
    byType: [
      { type: "KEY_MISSING", count: 0 },
      { type: "WRONG_KEY", count: 0 },
      { type: "KEY_DAMAGED", count: 0 },
      { type: "KEY_LOCKED_INSIDE", count: 0 },
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
        timezoneBoundaries: [{
          timezone: "Asia/Amman",
          locationCount: 3,
          activeLocationCount: 2,
          inactiveLocationCount: 1,
          periodStartUtc: "2026-08-31T21:00:00.000Z",
          periodEndUtc: "2026-09-02T21:00:00.000Z",
        }],
      },
      operational: {
        metrics: {
          checkInTime: { sampleCount: 1, averageSeconds: "1.000", contributingLocationCount: 1 },
          parkingTime: { sampleCount: 2, averageSeconds: "2.000", contributingLocationCount: 2 },
          retrievalWait: { sampleCount: 9, averageSeconds: "42.125", contributingLocationCount: 2 },
          retrievalStartLatencyAuxiliary: { sampleCount: 9, averageSeconds: "888.000", contributingLocationCount: 2 },
          handoffTime: { sampleCount: 3, averageSeconds: "3.000", contributingLocationCount: 2 },
        },
        carsHandledPerDay: [{ date: "2026-09-01", handledCount: 21 }],
      },
      financial: { currencies: [], cashReconciliation: [] },
      incidents: {
        incidentCount: 6,
        severityCounts: [],
        typeCounts: [],
        incidentsPer1000: { numerator: 6, denominator: 21, value: "285.714" },
      },
      kpis: {
        slaCompliance: {
          numerator: 10,
          denominator: 12,
          percentage: "83.33",
          missingTargetCount: 1,
          invalidOrMissingIntervalCount: 2,
          contributingLocationCount: 2,
          requestCount: 15,
        },
        carsPerActiveEmployee: {
          numerator: 21,
          denominator: 5,
          value: "4.200",
          evidenceLocationCount: 2,
        },
        carsHandedOff: {
          attributedCount: 20,
          missingAttributionCount: 1,
          distinctAttributedEmployeeCount: 5,
        },
        keyExceptions: {
          count: 0,
          byType: [
            { type: "KEY_MISSING", count: 0 },
            { type: "WRONG_KEY", count: 0 },
            { type: "KEY_DAMAGED", count: 0 },
            { type: "KEY_LOCKED_INSIDE", count: 0 },
          ],
        },
      },
    },
  };
}

describe("MD-05B Overview presentation", () => {
  it("maps exact Location facts from their authoritative fields", () => {
    const result = locationOverviewPresentation(operations, incidents, kpis);
    expect(result.carsHandled).toBe(17);
    expect(result.activeEmployeeCount).toBe(4);
    expect(result.retrievalWaitAverageSeconds).toBe("33.125");
    expect(result.retrievalWaitSampleCount).toBe(7);
    expect(result.incidentCount).toBe(4);
    expect(result.activity).toEqual(operations.carsHandledPerDay);
    expect(result.activity[1]).toEqual({ date: "2026-09-02", handledCount: 0 });
  });

  it("never substitutes auxiliary retrieval latency for Retrieval Wait", () => {
    expect(locationOverviewPresentation(operations, incidents, kpis)
      .retrievalWaitAverageSeconds).toBe("33.125");
    expect(operations.metrics.retrievalStartLatencyAuxiliary.averageSeconds).toBe("999.000");
  });

  it("preserves the complete SLA evidence and null Retrieval Wait", () => {
    const result = locationOverviewPresentation({
      ...operations,
      metrics: {
        ...operations.metrics,
        retrievalWait: { sampleCount: 0, averageSeconds: null },
      },
    }, incidents, kpis);
    expect(result.retrievalWaitAverageSeconds).toBeNull();
    expect(result.slaCompliance).toEqual(kpis.slaCompliance);
  });

  it("does not add fallback chart data for a legitimate empty cohort", () => {
    const result = locationOverviewPresentation(
      { ...operations, carsHandledPerDay: [] },
      incidents,
      kpis,
    );
    expect(result.activity).toEqual([]);
  });

  it("uses only the Company response for Company presentation and exposes coverage", () => {
    const source = companyResponse();
    const result = companyOverviewPresentation(source);
    expect(result.carsHandled).toBe(21);
    expect(result.retrievalWaitAverageSeconds).toBe("42.125");
    expect(result.incidentCount).toBe(6);
    expect(result.companyCoverage).toBe(source.summary.coverage);
  });

  it("keeps current Location state counts and queue as current persisted evidence", () => {
    const counts: SessionStateCountsResponse = {
      counts: [
        "AWAITING_PARKING", "CHECKING_IN", "COMPLETED", "HANDOFF_PENDING",
        "PARKED", "PARKING", "READY", "REQUESTED", "RETRIEVING",
      ].map((state, index) => ({ state: state as SessionStateCountsResponse["counts"][number]["state"], count: index })),
    };
    const queue: QueueSnapshotResponse = { depth: 3, oldestAgeSeconds: null };
    expect(locationCurrentPresentation(counts, queue)).toEqual({ counts: counts.counts, queue });
    expect(overviewCopy("en").current.toLowerCase()).not.toContain("today");
  });

  it("provides EN/AR business copy for all retained top facts", () => {
    for (const locale of ["en", "ar"] as const) {
      const copy = overviewCopy(locale);
      expect([copy.carsHandled, copy.slaCompliance, copy.retrievalWait, copy.incidents])
        .toHaveLength(4);
      expect(copy.carsHandled.length).toBeGreaterThan(0);
    }
  });
});
