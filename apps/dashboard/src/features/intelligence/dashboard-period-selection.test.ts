import { describe, expect, it } from "vitest";

import {
  parseDashboardPeriodUrl,
  periodSelectionSearch,
} from "./dashboard-period-selection";

describe("Dashboard period URL", () => {
  it("defaults an absent selector to a relative Today", () => {
    expect(parseDashboardPeriodUrl("")).toEqual({
      kind: "selected",
      selection: { kind: "PRESET", preset: "TODAY" },
    });
  });

  it("preserves a valid explicit absolute range as Custom", () => {
    expect(parseDashboardPeriodUrl("?from=2026-09-01&to=2026-09-30")).toEqual({
      kind: "selected",
      selection: {
        kind: "CUSTOM",
        period: { from: "2026-09-01", to: "2026-09-30" },
      },
    });
  });

  it.each([
    "?from=2026-09-01",
    "?to=2026-09-01",
    "?from=2026-02-30&to=2026-03-01",
    "?from=2026-09-30&to=2026-09-01",
    "?from=2026-09-01&to=2026-10-02",
    "?preset=NOPE",
    "?preset=TODAY&from=2026-09-01",
    "?from=2026-09-01&from=2026-09-02&to=2026-09-03",
  ])("keeps %s invalid", (search) => {
    expect(parseDashboardPeriodUrl(search).kind).toBe("invalid");
  });

  it("writes typed preset metadata without retaining old absolute boundaries", () => {
    expect(
      periodSelectionSearch("?from=2026-09-01&to=2026-09-02", {
        kind: "PRESET",
        preset: "LAST_7_DAYS",
      }),
    ).toBe("preset=LAST_7_DAYS");
  });
});
