import { describe, expect, it } from "vitest";

import { buildDashboardApiUrl } from "./dashboard-api-url";

describe("buildDashboardApiUrl", () => {
  it("preserves relative and absolute path semantics for both API transports", () => {
    expect(buildDashboardApiUrl("", "alerts")).toBe("/alerts");
    expect(buildDashboardApiUrl("https://api.example.test", "/alerts")).toBe(
      "https://api.example.test/alerts",
    );
  });

  it("encodes non-null query values and does not append empty query markers", () => {
    expect(
      buildDashboardApiUrl("https://api.example.test", "alerts", {
        location: "A & B",
        page: 0,
        active: false,
        missing: null,
        optional: undefined,
      }),
    ).toBe(
      "https://api.example.test/alerts?location=A+%26+B&page=0&active=false",
    );
    expect(buildDashboardApiUrl("", "/alerts", { missing: null })).toBe(
      "/alerts",
    );
  });
});
