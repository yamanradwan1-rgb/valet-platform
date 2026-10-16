import { describe, expect, it } from "vitest";

import {
  resolveDashboardApiOrigin,
  staffApiRewriteDestination,
  STAFF_API_REWRITE_SOURCE,
} from "./api-origin";

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

  it("rejects every remote plaintext origin in production", () => {
    for (const apiOrigin of [
      "http://remote-host.example:3001", "http://10.0.0.10:3001",
      "http://192.168.1.20:3001", "http://public-api.example.com",
      "http://example.com:65534", "http://localhost:3001",
      "http://127.0.0.1.evil.example:3001", "http://127.1:3001",
    ]) {
      expect(() => resolveDashboardApiOrigin({ apiOrigin, nodeEnv: "production" })).toThrow(/API_ORIGIN/);
    }
  });

  it("rejects malformed and normalized-away path contamination", () => {
    for (const apiOrigin of [
      "nonsense", "ftp://api.example.com", "https://user:pass@api.example.com",
      "https://api.example.com/anything/..", "https://api.example.com?x=1",
      "https://api.example.com#fragment", "https://api.example.com\\foo",
    ]) {
      expect(() => resolveDashboardApiOrigin({ apiOrigin, nodeEnv: "production" })).toThrow(/API_ORIGIN/);
    }
  });

  it("preserves HTTPS, explicit literal loopback, local development and rewrite shape", () => {
    for (const apiOrigin of ["http://127.0.0.1:3001", "http://[::1]:3001"]) {
      expect(resolveDashboardApiOrigin({ apiOrigin, nodeEnv: "production" })).toBe(apiOrigin);
    }
    expect(resolveDashboardApiOrigin({ apiOrigin: undefined, nodeEnv: "development" })).toBe("http://localhost:3001");
    expect(staffApiRewriteDestination({ apiOrigin: "https://api.example.com", nodeEnv: "production" }))
      .toBe("https://api.example.com/v1/staff/:path*");
  });
});
