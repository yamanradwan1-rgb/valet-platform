import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultReportPeriodValue,
  draftValueForKind,
  isCalendarMonthValue,
  isMondayLocalDate,
  mondayOfLocalDate,
  reportPeriodStartForFilename,
  validateReportPeriodInput,
} from "./reports-period";

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Period semantics mirrored from apps/api report-period.ts (D4-002):
 * DAILY = exact local calendar date; WEEKLY weekStart MUST be a Monday;
 * MONTHLY = YYYY-MM. Calendar math is pure-date UTC (DST-free).
 */

describe("daily period validation", () => {
  it("accepts exact calendar dates and rejects impossible ones", () => {
    expect(validateReportPeriodInput("DAILY", "2026-01-30")).toBeNull();
    expect(validateReportPeriodInput("DAILY", "2025-02-29")).toBe("dateFormat");
    expect(validateReportPeriodInput("DAILY", "2026-13-01")).toBe("dateFormat");
    expect(validateReportPeriodInput("DAILY", "20260130")).toBe("dateFormat");
    expect(validateReportPeriodInput("DAILY", "")).toBe("dateFormat");
  });
});

describe("weekly period validation (backend Monday rule)", () => {
  it("accepts Mondays only", () => {
    // 2026-01-05 is a Monday; 2026-01-06 is a Tuesday.
    expect(isMondayLocalDate("2026-01-05")).toBe(true);
    expect(validateReportPeriodInput("WEEKLY", "2026-01-05")).toBeNull();
    expect(isMondayLocalDate("2026-01-06")).toBe(false);
    expect(validateReportPeriodInput("WEEKLY", "2026-01-06")).toBe(
      "weekMonday",
    );
    expect(validateReportPeriodInput("WEEKLY", "not-a-date")).toBe(
      "weekFormat",
    );
  });
});

describe("monthly period validation (backend YYYY-MM rule)", () => {
  it("accepts YYYY-MM with month 01-12 only", () => {
    expect(validateReportPeriodInput("MONTHLY", "2026-01")).toBeNull();
    expect(validateReportPeriodInput("MONTHLY", "2026-12")).toBeNull();
    expect(validateReportPeriodInput("MONTHLY", "2026-00")).toBe(
      "monthFormat",
    );
    expect(validateReportPeriodInput("MONTHLY", "2026-13")).toBe(
      "monthFormat",
    );
    expect(validateReportPeriodInput("MONTHLY", "2026-1")).toBe(
      "monthFormat",
    );
    expect(isCalendarMonthValue("2026-01")).toBe(true);
  });
});

describe("defaults resolve in the LOCATION timezone", () => {
  it("derives today in the given timezone, not the browser zone", () => {
    // 2026-01-31 23:30 UTC is already February 1st in Asia/Amman (UTC+3).
    vi.useFakeTimers({ now: new Date("2026-01-31T23:30:00Z") });
    expect(defaultReportPeriodValue("DAILY", "Asia/Amman")).toBe(
      "2026-02-01",
    );
    expect(defaultReportPeriodValue("DAILY", "UTC")).toBe("2026-01-31");
  });

  it("snaps the weekly default back to that day's Monday across a DST boundary", () => {
    // US spring-forward 2026-03-08; pure-date Monday math is unaffected.
    expect(mondayOfLocalDate("2026-03-10")).toBe("2026-03-09");
    expect(mondayOfLocalDate("2026-03-08")).toBe("2026-03-02");
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00Z") });
    expect(defaultReportPeriodValue("WEEKLY", "America/New_York")).toBe(
      "2026-03-09",
    );
  });

  it("truncates the monthly default to YYYY-MM", () => {
    vi.useFakeTimers({ now: new Date("2026-01-31T23:59:00Z") });
    expect(defaultReportPeriodValue("MONTHLY", "Asia/Amman")).toBe("2026-02");
    expect(defaultReportPeriodValue("MONTHLY", "UTC")).toBe("2026-01");
  });
});

describe("filename period start mirrors the backend formula", () => {
  it("uses the date/weekStart verbatim and month-01 for monthly", () => {
    expect(reportPeriodStartForFilename("DAILY", "2026-01-30")).toBe(
      "2026-01-30",
    );
    expect(reportPeriodStartForFilename("WEEKLY", "2026-01-05")).toBe(
      "2026-01-05",
    );
    expect(reportPeriodStartForFilename("MONTHLY", "2026-01")).toBe(
      "2026-01-01",
    );
  });
});

describe("per-kind drafts stay side by side", () => {
  it("reads the field matching the requested kind", () => {
    const drafts = { date: "2026-01-30", month: "2026-01", weekStart: "2026-01-05" };
    expect(draftValueForKind(drafts, "DAILY")).toBe("2026-01-30");
    expect(draftValueForKind(drafts, "WEEKLY")).toBe("2026-01-05");
    expect(draftValueForKind(drafts, "MONTHLY")).toBe("2026-01");
  });
});
