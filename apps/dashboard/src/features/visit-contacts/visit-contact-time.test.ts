import { describe, expect, it } from "vitest";
import { formatVisitContactTime } from "./visit-contact-time-format";

describe("visit instant presentation", () => {
  it("uses explicit UTC, including across an offset date boundary", () => {
    const instant = "2026-09-21T00:30:00+03:00";
    expect(formatVisitContactTime(instant, "en")).toContain("Sep 20, 2026");
    expect(formatVisitContactTime(instant, "en")).toContain("09:30 PM UTC");
    expect(formatVisitContactTime(instant, "ar")).toContain("UTC");
    expect(formatVisitContactTime(instant, "ar")).not.toContain("Sep");
  });
});
