import { describe, expect, it } from "vitest";

import {
  civilDateAt,
  currentReportSelector,
  resolvePeriodPreset,
} from "./dashboard-period-calendar";

describe("Dashboard calendar selectors", () => {
  const instant = Date.parse("2026-09-28T21:30:00Z");

  it("uses the configured calendar timezone rather than the browser timezone", () => {
    expect(civilDateAt(instant, "Asia/Amman")).toBe("2026-09-29");
    expect(civilDateAt(instant, "America/New_York")).toBe("2026-09-28");
  });

  it.each([
    ["TODAY", "2026-09-29"],
    ["LAST_2_DAYS", "2026-09-28"],
    ["LAST_3_DAYS", "2026-09-27"],
    ["LAST_7_DAYS", "2026-09-23"],
    ["LAST_14_DAYS", "2026-09-16"],
    ["LAST_30_DAYS", "2026-08-31"],
  ] as const)("resolves %s as inclusive civil dates", (preset, from) => {
    expect(resolvePeriodPreset(instant, "Asia/Amman", preset)).toEqual({
      from,
      to: "2026-09-29",
    });
  });

  it("crosses year and leap boundaries without elapsed-day arithmetic", () => {
    expect(
      resolvePeriodPreset(
        Date.parse("2024-03-01T12:00:00Z"),
        "UTC",
        "LAST_2_DAYS",
      ),
    ).toEqual({ from: "2024-02-29", to: "2024-03-01" });
    expect(
      resolvePeriodPreset(
        Date.parse("2026-01-01T12:00:00Z"),
        "UTC",
        "LAST_3_DAYS",
      ),
    ).toEqual({ from: "2025-12-30", to: "2026-01-01" });
  });

  it("keeps a two-day preset at a DST boundary", () => {
    expect(
      resolvePeriodPreset(
        Date.parse("2026-03-08T16:00:00Z"),
        "America/New_York",
        "LAST_2_DAYS",
      ),
    ).toEqual({ from: "2026-03-07", to: "2026-03-08" });
  });

  it("uses current Daily, Monday Weekly, and Monthly selectors", () => {
    expect(currentReportSelector(instant, "Asia/Amman", "DAILY")).toEqual({
      kind: "DAILY",
      date: "2026-09-29",
    });
    expect(currentReportSelector(instant, "Asia/Amman", "WEEKLY")).toEqual({
      kind: "WEEKLY",
      weekStart: "2026-09-28",
    });
    expect(
      currentReportSelector(instant, "America/New_York", "MONTHLY"),
    ).toEqual({ kind: "MONTHLY", month: "2026-09" });
  });

  it("advances Weekly only on Monday and Monthly only on the first calendar day", () => {
    const sunday = Date.parse("2026-09-27T12:00:00Z");
    const monday = Date.parse("2026-09-28T12:00:00Z");
    expect(currentReportSelector(sunday, "UTC", "WEEKLY")).toEqual({
      kind: "WEEKLY",
      weekStart: "2026-09-21",
    });
    expect(currentReportSelector(monday, "UTC", "WEEKLY")).toEqual({
      kind: "WEEKLY",
      weekStart: "2026-09-28",
    });
    expect(
      currentReportSelector(
        Date.parse("2026-09-30T20:30:00Z"),
        "Asia/Amman",
        "MONTHLY",
      ),
    ).toEqual({ kind: "MONTHLY", month: "2026-09" });
    expect(
      currentReportSelector(
        Date.parse("2026-09-30T21:30:00Z"),
        "Asia/Amman",
        "MONTHLY",
      ),
    ).toEqual({ kind: "MONTHLY", month: "2026-10" });
  });
});
