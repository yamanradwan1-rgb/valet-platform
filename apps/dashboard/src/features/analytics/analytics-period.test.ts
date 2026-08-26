import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultAnalyticsPeriod,
  inclusiveDayCount,
  isCalendarLocalDate,
  shiftLocalDate,
  todayInTimeZone,
  validateAnalyticsPeriodInput,
} from "./analytics-period";

describe("analytics period input validation (backend mirror)", () => {
  it("accepts a single-day period", () => {
    expect(validateAnalyticsPeriodInput("2026-08-18", "2026-08-18")).toBeNull();
  });

  it("accepts exactly 31 inclusive days (30 days of difference)", () => {
    expect(validateAnalyticsPeriodInput("2026-08-01", "2026-08-31")).toBeNull();
  });

  it("rejects 32 inclusive days", () => {
    expect(validateAnalyticsPeriodInput("2026-08-01", "2026-09-01")).toBe(
      "range",
    );
  });

  it("rejects from > to", () => {
    expect(validateAnalyticsPeriodInput("2026-08-10", "2026-08-09")).toBe(
      "order",
    );
  });

  it("rejects malformed dates and impossible calendar dates", () => {
    expect(validateAnalyticsPeriodInput("2026-8-1", "2026-08-09")).toBe(
      "format",
    );
    expect(validateAnalyticsPeriodInput("2026-02-30", "2026-03-01")).toBe(
      "format",
    );
    expect(validateAnalyticsPeriodInput("2026-13-01", "2026-12-31")).toBe(
      "format",
    );
    expect(validateAnalyticsPeriodInput("not-a-date", "2026-08-09")).toBe(
      "format",
    );
  });
});

describe("local date helpers", () => {
  it("counts inclusive days including both endpoints", () => {
    expect(inclusiveDayCount("2026-08-18", "2026-08-18")).toBe(1);
    expect(inclusiveDayCount("2026-08-18", "2026-08-24")).toBe(7);
    expect(inclusiveDayCount("2026-02-28", "2026-03-01")).toBe(2);
  });

  it("shifts dates across month and year boundaries", () => {
    expect(shiftLocalDate("2026-08-30", 3)).toBe("2026-09-02");
    expect(shiftLocalDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftLocalDate("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("validates strict calendar dates only", () => {
    expect(isCalendarLocalDate("2026-04-31")).toBe(false);
    expect(isCalendarLocalDate("2026-04-30")).toBe(true);
    expect(isCalendarLocalDate("20260430")).toBe(false);
  });
});

describe("location-timezone day resolution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves today's local date in the location timezone, not the browser's", () => {
    // 22:00 UTC: already tomorrow in Asia/Amman (+3) but still "yesterday-ish"
    // earlier west of Greenwich.
    vi.setSystemTime(new Date("2026-01-15T22:00:00Z"));
    expect(todayInTimeZone("Asia/Amman")).toBe("2026-01-16");
    expect(todayInTimeZone("America/New_York")).toBe("2026-01-15");
    expect(todayInTimeZone("UTC")).toBe("2026-01-15");
  });

  it("defaults the requested period to the last 7 inclusive local days", () => {
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const period = defaultAnalyticsPeriod("Asia/Amman");
    // 12:00Z is 15:00 local on Aug 24 (Asia/Amman, UTC+3 fixed).
    expect(period.from).toBe("2026-08-18");
    expect(period.to).toBe("2026-08-24");
    expect(inclusiveDayCount(period.from, period.to)).toBe(7);
    expect(validateAnalyticsPeriodInput(period.from, period.to)).toBeNull();
  });

  it("falls back to UTC for an unknown timezone instead of guessing", () => {
    vi.setSystemTime(new Date("2026-08-24T00:30:00Z"));
    expect(todayInTimeZone("Not/AZone")).toBe("2026-08-24");
  });

  it("resolves a local date one calendar day ahead of UTC (Pacific/Kiritimati, UTC+14)", () => {
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    expect(todayInTimeZone("UTC")).toBe("2026-05-01");
    expect(todayInTimeZone("Pacific/Kiritimati")).toBe("2026-05-02");
  });

  it("crosses the DST spring-forward boundary on LOCAL calendar days", () => {
    // America/New_York springs forward 2026-03-08 at 07:00Z (offset -5 → -4).
    // Local midnight Mar 8→9 therefore happens at 04:00Z on Mar 9.
    vi.setSystemTime(new Date("2026-03-09T03:59:00Z"));
    expect(todayInTimeZone("America/New_York")).toBe("2026-03-08");
    vi.setSystemTime(new Date("2026-03-09T04:00:00Z"));
    expect(todayInTimeZone("America/New_York")).toBe("2026-03-09");
  });

  it("crosses the DST fall-back boundary on LOCAL calendar days", () => {
    // America/New_York falls back 2026-11-01 at 06:00Z (offset -4 → -5).
    // Local midnight Nov 1→2 therefore happens at 05:00Z on Nov 2.
    vi.setSystemTime(new Date("2026-11-02T04:59:00Z"));
    expect(todayInTimeZone("America/New_York")).toBe("2026-11-01");
    vi.setSystemTime(new Date("2026-11-02T05:00:00Z"));
    expect(todayInTimeZone("America/New_York")).toBe("2026-11-02");
  });

  it("keeps the default period at 7 LOCAL calendar days across a DST change", () => {
    // The default range spans the spring-forward day (23h local day), yet
    // covers exactly seven calendar dates — never 7*24h of milliseconds.
    vi.setSystemTime(new Date("2026-03-09T03:30:00Z"));
    const period = defaultAnalyticsPeriod("America/New_York");
    expect(period.from).toBe("2026-03-02");
    expect(period.to).toBe("2026-03-08");
    expect(inclusiveDayCount(period.from, period.to)).toBe(7);
    expect(validateAnalyticsPeriodInput(period.from, period.to)).toBeNull();
  });
});
