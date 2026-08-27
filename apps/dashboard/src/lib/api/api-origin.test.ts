import { describe, expect, it } from "vitest";

import {
  DASHBOARD_DEVELOPMENT_API_ORIGIN,
  resolveDashboardApiOrigin,
  STAFF_API_REWRITE_SOURCE,
  staffApiBaseUrl,
  staffApiRewriteDestination,
} from "./api-origin";
import { STAFF_API_BROWSER_BASE_PATH } from "./api-config";

function environment(
  apiOrigin: string | undefined,
  nodeEnv: string | undefined,
) {
  return { apiOrigin, nodeEnv };
}

describe("Dashboard API_ORIGIN authority", () => {
  it("uses the deliberate localhost default outside production", () => {
    expect(resolveDashboardApiOrigin(environment(undefined, "development"))).toBe(
      DASHBOARD_DEVELOPMENT_API_ORIGIN,
    );
    expect(resolveDashboardApiOrigin(environment(undefined, "test"))).toBe(
      DASHBOARD_DEVELOPMENT_API_ORIGIN,
    );
  });

  it("requires an explicit production origin", () => {
    expect(() =>
      resolveDashboardApiOrigin(environment(undefined, "production")),
    ).toThrow("API_ORIGIN is required in production");
  });

  it("normalizes an explicit bare production origin", () => {
    expect(
      resolveDashboardApiOrigin(
        environment(" https://api.example.test:8443/ ", "production"),
      ),
    ).toBe("https://api.example.test:8443");
  });

  it("allows an explicit localhost production origin for a private topology", () => {
    expect(
      resolveDashboardApiOrigin(
        environment("http://localhost:3001", "production"),
      ),
    ).toBe("http://localhost:3001");
  });

  it.each([
    "not a URL",
    "ftp://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test/v1",
    "https://api.example.test?environment=production",
    "https://api.example.test#fragment",
  ])("rejects unsafe origin %s", (apiOrigin) => {
    expect(() =>
      resolveDashboardApiOrigin(environment(apiOrigin, "production")),
    ).toThrow("Dashboard API_ORIGIN configuration error");
  });

  it("forms the exact same-origin staff rewrite destination", () => {
    const config = environment("http://127.0.0.1:4310", "production");
    expect(STAFF_API_REWRITE_SOURCE).toBe("/v1/staff/:path*");
    expect(staffApiBaseUrl(resolveDashboardApiOrigin(config))).toBe(
      "http://127.0.0.1:4310/v1/staff",
    );
    expect(staffApiRewriteDestination(config)).toBe(
      "http://127.0.0.1:4310/v1/staff/:path*",
    );
  });

  it("keeps browser traffic on the same-origin staff path", () => {
    expect(STAFF_API_BROWSER_BASE_PATH).toBe("/v1/staff");
  });
});
