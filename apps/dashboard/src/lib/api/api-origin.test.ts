import { describe, expect, it } from "vitest";

import { resolveDashboardApiOrigin, STAFF_API_REWRITE_SOURCE } from "./api-origin";

describe("Dashboard API origin", () => {
  it("fails closed when production API_ORIGIN is missing", () => {
    expect(() =>
      resolveDashboardApiOrigin({ apiOrigin: undefined, nodeEnv: "production" }),
    ).toThrow(/required in production/);
  });

  it("rejects credentials, paths, and non-http protocols", () => {
    for (const apiOrigin of [
      "https://user:pass@example.com",
      "https://example.com/v1",
      "ftp://example.com",
    ]) {
      expect(() =>
        resolveDashboardApiOrigin({ apiOrigin, nodeEnv: "production" }),
      ).toThrow(/Dashboard API_ORIGIN/);
    }
  });

  it("normalizes a valid configured origin", () => {
    expect(
      resolveDashboardApiOrigin({
        apiOrigin: "https://api.example.com:8443/",
        nodeEnv: "production",
      }),
    ).toBe("https://api.example.com:8443");
  });

  it("keeps the browser Staff path aligned with the refresh-cookie Path", () => {
    expect(STAFF_API_REWRITE_SOURCE).toBe("/v1/staff/:path*");
  });
});
