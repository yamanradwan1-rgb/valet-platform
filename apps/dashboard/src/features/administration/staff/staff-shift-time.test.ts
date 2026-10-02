import { describe, expect, it } from "vitest";
import { historyDateRange, shiftDuration } from "./staff-shift-time";

describe("shift history civil dates and local duration", () => {
  it("converts Location midnight and labels all-scope UTC without browser timezone", () => {
    expect(historyDateRange("2026-10-01", "2026-10-02", "Asia/Amman")).toEqual({
      from: "2026-09-30T21:00:00.000Z",
      to: "2026-10-01T21:00:00.000Z",
      valid: true,
    });
    expect(historyDateRange("2026-10-01", "", "UTC")).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      to: undefined,
      valid: true,
    });
    expect(
      historyDateRange("2026-03-08", "2026-03-09", "America/New_York"),
    ).toEqual({
      from: "2026-03-08T05:00:00.000Z",
      to: "2026-03-09T04:00:00.000Z",
      valid: true,
    });
  });
  it("blocks equal/reversed/invalid/nonexistent/ambiguous midnight boundaries", () => {
    for (const [from, to, zone] of [
      ["2026-10-02", "2026-10-01", "UTC"],
      ["2026-10-01", "2026-10-01", "UTC"],
      ["2026-02-30", "", "UTC"],
      ["bad", "", "UTC"],
      ["2011-12-30", "", "Pacific/Apia"],
      ["2020-11-01", "", "America/Havana"],
      ["2026-10-01", "", "bad-zone"],
    ])
      expect(historyDateRange(from!, to!, zone!).valid).toBe(false);
  });
  it("fixes ended duration, clamps skew, and localizes compact values", () => {
    const row = {
      startedAt: "2026-10-01T00:00:00Z",
      endedAt: "2026-10-01T02:37:00Z",
    };
    expect(shiftDuration(row, Date.parse("2026-10-02T00:00:00Z"), "en")).toBe(
      "2h 37m",
    );
    expect(
      shiftDuration(
        { ...row, endedAt: null },
        Date.parse("2026-10-01T02:37:00Z"),
        "en",
      ),
    ).toBe("2h 37m");
    expect(shiftDuration({ ...row, endedAt: null }, 0, "en")).toBe("0m");
    expect(shiftDuration(row, 0, "ar")).toBe("٢ س ٣٧ د");
    expect(shiftDuration({ startedAt: "bad", endedAt: null }, 0, "en")).toBe(
      "—",
    );
  });
});
