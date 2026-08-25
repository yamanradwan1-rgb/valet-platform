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
  it("renders valid ISO timestamps without emitting Invalid Date", () => {
    const rendered = formatTimestamp("2026-08-24T09:14:00Z", "en");
    expect(rendered).not.toContain("Invalid");
    expect(rendered.length).toBeGreaterThan(0);
  });

  it("renders invalid input as an em dash instead of crashing", () => {
    expect(formatTimestamp("not-a-date", "en")).toBe("—");
    expect(formatTimestamp("not-a-date", "ar")).toBe("—");
  });

  it("accepts both supported locales", () => {
    for (const locale of ["en", "ar"] as const) {
      expect(formatTimestamp("2026-08-24T09:14:00Z", locale).length).toBeGreaterThan(0);
    }
  });
});
