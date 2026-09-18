import { describe, expect, it } from "vitest";

import {
  companyDailyReportResponseSchema,
  companyPeriodicReportResponseSchema,
  companyReportExportRequestSchema,
} from "./company-report.js";

const organizationId = "22222222-2222-4222-8222-222222222222";

function duration() {
  return { averageSeconds: null, contributingLocationCount: 0, sampleCount: 0 };
}

function summary() {
  return {
    coverage: {
      activeLocationCount: 0,
      inactiveLocationCount: 0,
      timezoneBoundaries: [],
      totalLocationCount: 0,
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
        byType: [
          { count: 0, type: "KEY_MISSING" },
          { count: 0, type: "WRONG_KEY" },
          { count: 0, type: "KEY_DAMAGED" },
          { count: 0, type: "KEY_LOCKED_INSIDE" },
        ],
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
  } as const;
}

describe("MGT-BE-11 company report contracts", () => {
  it("requires controlled DAILY activity and reuses the company aggregate summary", () => {
    const report = {
      dailyActivity: {
        dispatchEventCounts: [],
        keyCustodyEventCounts: [],
        retrievalRequestedCount: 0,
      },
      kind: "DAILY" as const,
      organizationId,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-01",
      summary: summary(),
    };
    expect(companyDailyReportResponseSchema.parse(report)).toEqual(report);
    const { dailyActivity: _dailyActivity, ...missingActivity } = report;
    void _dailyActivity;
    expect(companyDailyReportResponseSchema.safeParse(missingActivity).success).toBe(false);
    expect(
      companyDailyReportResponseSchema.safeParse({
        ...report,
        dailyActivity: { ...report.dailyActivity, rawStaff: [] },
      }).success,
    ).toBe(false);
  });

  it("bounds DAILY activity groups to the existing controlled catalogs", () => {
    const base = {
      retrievalRequestedCount: 0,
      dispatchEventCounts: Array.from({ length: 17 }, () => ({
        count: 0,
        eventType: "QUEUED",
        taskType: "PARKING",
      })),
      keyCustodyEventCounts: [],
    };
    expect(
      companyDailyReportResponseSchema.safeParse({
        dailyActivity: base,
        kind: "DAILY",
        organizationId,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-01",
        summary: summary(),
      }).success,
    ).toBe(false);
    expect(
      companyDailyReportResponseSchema.safeParse({
        dailyActivity: {
          ...base,
          dispatchEventCounts: [],
          keyCustodyEventCounts: Array.from({ length: 6 }, () => ({
            count: 0,
            eventType: "SLOT_ASSIGNED",
          })),
        },
        kind: "DAILY",
        organizationId,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-01",
        summary: summary(),
      }).success,
    ).toBe(false);
  });

  it.each(["WEEKLY", "MONTHLY"] as const)(
    "keeps %s reports free of daily activity",
    (kind) => {
      const report = {
        kind,
        organizationId,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        summary: summary(),
      };
      expect(companyPeriodicReportResponseSchema.parse(report)).toEqual(report);
      expect(
        companyPeriodicReportResponseSchema.safeParse({
          ...report,
          dailyActivity: {
            dispatchEventCounts: [],
            keyCustodyEventCounts: [],
            retrievalRequestedCount: 0,
          },
        }).success,
      ).toBe(false);
    },
  );

  it("reuses only the existing DAILY/WEEKLY/MONTHLY CSV/PDF export request formats", () => {
    for (const request of [
      { date: "2026-09-01", format: "CSV", kind: "DAILY" },
      { format: "PDF", kind: "WEEKLY", weekStart: "2026-08-31" },
      { format: "CSV", kind: "MONTHLY", month: "2026-09" },
    ] as const) {
      expect(companyReportExportRequestSchema.safeParse(request).success).toBe(true);
    }
    expect(
      companyReportExportRequestSchema.safeParse({
        date: "2026-09-01",
        format: "XLSX",
        kind: "DAILY",
      }).success,
    ).toBe(false);
    expect(
      companyReportExportRequestSchema.safeParse({
        date: "2026-09-01",
        format: "CSV",
        kind: "DAILY",
        includeContacts: true,
      }).success,
    ).toBe(false);
  });
});
