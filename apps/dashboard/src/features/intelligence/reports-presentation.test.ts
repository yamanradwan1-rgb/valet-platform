import { describe, expect, it } from "vitest";

import { reportPresentation, validateReportSelector } from "./reports-presentation";

describe("MD-05D report selector validation", () => {
  it("accepts real canonical DAILY dates and rejects malformed/impossible/low-year dates", () => {
    expect(validateReportSelector("DAILY", "2026-02-28")).toEqual({
      kind: "valid",
      selector: { kind: "DAILY", date: "2026-02-28" },
    });
    for (const value of ["", "2026-02-30", "26-02-28", "0099-01-01"]) {
      expect(validateReportSelector("DAILY", value).kind).not.toBe("valid");
    }
  });

  it("accepts only a real Monday for WEEKLY without coercion", () => {
    expect(validateReportSelector("WEEKLY", "2026-09-21")).toEqual({
      kind: "valid",
      selector: { kind: "WEEKLY", weekStart: "2026-09-21" },
    });
    expect(validateReportSelector("WEEKLY", "2026-09-22").kind).toBe("invalid");
  });

  it("accepts valid MONTHLY YYYY-MM and has no automatic default", () => {
    expect(validateReportSelector("MONTHLY", "2026-09")).toEqual({
      kind: "valid",
      selector: { kind: "MONTHLY", month: "2026-09" },
    });
    expect(validateReportSelector("MONTHLY", "2026-13").kind).toBe("invalid");
    expect(validateReportSelector("MONTHLY", "").kind).toBe("required");
  });
});

describe("MD-05D report presentation", () => {
  const locationBase = {
    locationId: "11111111-1111-4111-8111-111111111111",
    timezone: "Asia/Amman",
    periodFrom: "2026-09-21",
    periodTo: "2026-09-27",
    summary: {
      metrics: {
        checkInTime: { averageSeconds: null, sampleCount: 0 },
        parkingTime: { averageSeconds: null, sampleCount: 0 },
        retrievalWait: { averageSeconds: null, sampleCount: 0 },
        retrievalStartLatencyAuxiliary: { averageSeconds: null, sampleCount: 0 },
        handoffTime: { averageSeconds: null, sampleCount: 0 },
      },
      carsHandledPerDay: [],
      currencies: [{
        currency: "JOD", paidPaymentCount: 0, collectedAmountTotal: "0.000", tipAmountTotal: "0.000",
        digitalPaymentRate: { numerator: 0, denominator: 0, percentage: null },
        succeededRefundAmountTotal: "0.000",
        validationRate: { numerator: 0, denominator: 0, percentage: null },
        currentValidationAmountTotal: "0.000",
      }],
      cashReconciliation: [{ currency: "JOD", cashExpectedTotal: "0.000", cashReportedTotal: "0.000", cashVarianceTotal: "-1.000" }],
      incidents: { incidentCount: 0, severityCounts: [], typeCounts: [], incidentsPer1000: { numerator: 0, denominator: 0, value: null } },
    },
  };

  it("preserves zero, null, exact currency strings and Location timezone", () => {
    const sections = reportPresentation({ ...locationBase, kind: "WEEKLY" }, "en");
    const text = JSON.stringify(sections);
    const rows = sections.flatMap((section) => section.rows);
    expect(text).toContain("Asia/Amman");
    expect(text).toContain("0.000");
    expect(text).toContain("-1.000");
    expect(rows.some((row) => row.value === null)).toBe(true);
    expect(rows.find((row) => row.label === "JOD.digitalPaymentRate.percentage")?.value).toBeNull();
    expect(rows.find((row) => row.label === "JOD.validationRate.percentage")?.value).toBeNull();
  });

  it("renders daily activity only when the DTO contains it", () => {
    const weekly = reportPresentation({ ...locationBase, kind: "WEEKLY" }, "en");
    const daily = reportPresentation({
      ...locationBase,
      kind: "DAILY",
      periodTo: "2026-09-21",
      dailyActivity: { retrievalRequestedCount: 0, dispatchEventCounts: [], keyCustodyEventCounts: [] },
    }, "en");
    expect(weekly.some((section) => section.title === "Daily activity")).toBe(false);
    expect(daily.some((section) => section.title === "Daily activity")).toBe(true);
  });

  it("marks only canonical dynamic labels for bidi isolation", () => {
    const sections = reportPresentation({
      ...locationBase,
      kind: "DAILY",
      periodTo: "2026-09-21",
      dailyActivity: {
        retrievalRequestedCount: 1,
        dispatchEventCounts: [{ taskType: "RETRIEVAL", eventType: "QUEUED", count: 1 }],
        keyCustodyEventCounts: [{ eventType: "RELEASED", count: 1 }],
      },
    }, "ar");
    const rows = sections.flatMap((section) => section.rows);
    expect(rows.find((row) => row.label === "JOD.paidPaymentCount")?.labelBidi).toBe("code");
    expect(rows.find((row) => row.label === "dispatch.RETRIEVAL.QUEUED")?.labelBidi).toBe("code");
    expect(rows.find((row) => row.label === "keyCustody.RELEASED")?.labelBidi).toBe("code");
    expect(rows.find((row) => row.label === "معرّف الموقع")?.labelBidi).toBeUndefined();
  });
});
