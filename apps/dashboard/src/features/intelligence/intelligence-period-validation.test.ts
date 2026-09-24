import { describe, expect, it } from "vitest";

import {
  explicitAnalyticsPeriod,
  validateAnalyticsPeriod,
} from "./intelligence-period-validation";

describe("intelligence period validation", () => {
  it("accepts real dates through 31 inclusive calendar days", () => {
    expect(validateAnalyticsPeriod("2026-09-01", "2026-10-01")).toEqual({
      kind: "valid",
      period: { from: "2026-09-01", to: "2026-10-01" },
    });
    expect(validateAnalyticsPeriod("2028-02-29", "2028-02-29").kind).toBe("valid");
  });

  it("rejects impossible, reversed, and 32-day periods", () => {
    expect(validateAnalyticsPeriod("2026-02-30", "2026-03-01").kind).toBe("invalid-date");
    expect(validateAnalyticsPeriod("2026-09-02", "2026-09-01").kind).toBe("reversed");
    expect(validateAnalyticsPeriod("2026-09-01", "2026-10-02").kind).toBe("too-long");
  });

  it("uses the same authoritative path for explicit URL periods", () => {
    expect(explicitAnalyticsPeriod("2026-09-01", "2026-10-01")).toEqual({
      from: "2026-09-01",
      to: "2026-10-01",
    });
    expect(explicitAnalyticsPeriod("2026-02-30", "2026-03-01")).toBeNull();
    expect(explicitAnalyticsPeriod("2026-09-01", "2026-10-02")).toBeNull();
  });
});
