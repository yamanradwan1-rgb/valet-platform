import { describe, expect, it } from "vitest";
import { analyticsPeriodQuerySchema } from "./location-analytics-common.js";
import {
  ratingFeedbackOptInQuerySchema as opted,
  ratingFeedbackReadQuerySchema as combined,
} from "./rating-feedback-opt-in-query.js";

const period = { from: "2026-11-01", to: "2026-11-26" };

describe("Issue #463 CT-10 isolated rating-only query opt-in", () => {
  it("preserves exact existing period-only schema and no accidental opt-in", () => {
    expect(analyticsPeriodQuerySchema.parse(period)).toEqual(period);
    expect(combined.parse(period)).toEqual(period);
    expect(opted.safeParse(period).success).toBe(false);
  });

  it("requires exactly includeComments=true as a string, not boolean", () => {
    const optedPeriod = { ...period, includeComments: "true" };
    expect(combined.parse(optedPeriod)).toEqual(optedPeriod);
    expect(opted.parse(optedPeriod)).toEqual(optedPeriod);
    expect(analyticsPeriodQuerySchema.safeParse(optedPeriod).success).toBe(false);
  });

  it.each([
    { ...period, includeComments: "false" },
    { ...period, includeComments: false },
    { ...period, includeComments: true },
    { ...period, includeComments: ["true"] },
    { ...period, includeComments: ["true", "true"] },
    { ...period, includeComments: "TRUE" },
    { ...period, extra: "true" },
    { ...period, includeComments: "true", extra: "x" },
    { ...period, from: ["2026-11-01"] },
    { ...period, from: undefined },
    { ...period, to: "not-date" },
    null,
    [],
  ])("rejects malformed, duplicate or unrelated rating query %#", (query) => {
    expect(combined.safeParse(query).success).toBe(false);
  });
});
