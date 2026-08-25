import { describe, expect, it } from "vitest";

import { formatTimestamp } from "./format-datetime";
import { shortIdentifier } from "./format-identifier";
import { humanizeIncidentType } from "./incident-type";

describe("formatTimestamp", () => {
  const instant = "2026-08-24T07:05:00+00:00";

  it("renders a short English timestamp deterministically in UTC", () => {
    expect(formatTimestamp(instant, "en", "UTC")).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}$/u,
    );
  });

  it("renders Arabic-script output for the ar locale", () => {
    const arabic = formatTimestamp(instant, "ar", "UTC");
    expect(arabic.length).toBeGreaterThan(0);
    expect(arabic).toMatch(/[\u0600-\u06FF]/u);
  });

  it("echoes an unparseable value verbatim instead of inventing a time", () => {
    expect(formatTimestamp("not-a-timestamp", "en")).toBe("not-a-timestamp");
  });
});

describe("shortIdentifier", () => {
  it("compacts long opaque ids D1-style without pretending to be names", () => {
    expect(shortIdentifier("954bed5d-fc7d-438a-9d39-b85f586fa101")).toBe(
      "954bed5d…a101",
    );
  });

  it("leaves short values untouched", () => {
    expect(shortIdentifier("B17")).toBe("B17");
  });
});

describe("humanizeIncidentType", () => {
  it("title-cases free backend type strings", () => {
    expect(humanizeIncidentType("KEY_MISSING")).toBe("Key Missing");
    expect(humanizeIncidentType("customer_complaint")).toBe(
      "Customer Complaint",
    );
  });

  it("falls back to an em dash for an empty free string", () => {
    expect(humanizeIncidentType("   ")).toBe("—");
  });
});
