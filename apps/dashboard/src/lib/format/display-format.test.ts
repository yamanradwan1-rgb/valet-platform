import { describe, expect, it } from "vitest";

import { formatTimestamp } from "./datetime-format";
import { shortIdentifier, shortIdentifierOr } from "./identifier-format";

const UUID = "481f7350-bb31-4f2d-a050-31a820d0a101";

describe("shortIdentifier", () => {
  it("shortens long identifiers to head…tail", () => {
    expect(shortIdentifier(UUID)).toBe("481f7350…a101");
  });

  it("keeps short values verbatim", () => {
    expect(shortIdentifier("ABC123")).toBe("ABC123");
  });
});

describe("shortIdentifierOr", () => {
  it("uses the caller's fallback for null without inventing values", () => {
    expect(shortIdentifierOr(null, "Unassigned")).toBe("Unassigned");
    expect(shortIdentifierOr(UUID, "Unassigned")).toBe("481f7350…a101");
  });
});

describe("formatTimestamp", () => {
  it("renders valid ISO timestamps in the explicit location timezone", () => {
    const rendered = formatTimestamp("2026-08-24T09:14:00Z", "en", "Asia/Amman");
    expect(rendered).not.toContain("Invalid");
    expect(rendered.length).toBeGreaterThan(0);
  });

  it("renders invalid input as an em dash instead of crashing", () => {
    expect(formatTimestamp("not-a-date", "en", "Asia/Amman")).toBe("—");
    expect(formatTimestamp("not-a-date", "ar", "Asia/Amman")).toBe("—");
  });

  it("accepts both supported locales", () => {
    const instant = "2026-08-24T09:14:00Z";
    const timeZone = "Asia/Amman";
    for (const locale of ["en", "ar"] as const) {
      expect(formatTimestamp(instant, locale, timeZone).length).toBeGreaterThan(0);
    }
    expect(formatTimestamp(instant, "ar", timeZone)).toMatch(/[\u0600-\u06FF]/u);
  });

  it("changes presentation immediately when the selected location changes", () => {
    const instant = "2026-01-15T12:00:00Z";
    const amman = formatTimestamp(instant, "en", "Asia/Amman");
    const newYork = formatTimestamp(instant, "en", "America/New_York");
    expect(amman).not.toBe(newYork);
    expect(amman).toContain("3:00 PM");
    expect(newYork).toContain("7:00 AM");
  });

  it("uses IANA DST data and fails safely for an invalid timezone", () => {
    expect(formatTimestamp("2026-01-15T17:00:00Z", "en", "America/New_York")).toContain("12:00 PM");
    expect(formatTimestamp("2026-07-15T17:00:00Z", "en", "America/New_York")).toContain("1:00 PM");
    expect(formatTimestamp("2026-03-08T07:30:00Z", "en", "America/New_York")).toContain("3:30 AM");
    expect(formatTimestamp("2026-08-24T09:14:00Z", "en", "Not/AZone")).toBe("—");
  });
});
