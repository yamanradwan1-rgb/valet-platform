import { afterEach, describe, expect, it, vi } from "vitest";

import { GUEST_API_BROWSER_BASE_PATH, getGuestApiBaseUrl } from "./api-config";
import {
  CUSTOMER_DEVELOPMENT_API_ORIGIN,
  GUEST_API_REWRITE_SOURCE,
  guestApiBaseUrl,
  guestApiRewriteDestination,
  resolveCustomerApiOrigin,
} from "./api-origin";

function environment(
  apiOrigin: string | undefined,
  nodeEnv: string | undefined,
) {
  return { apiOrigin, nodeEnv };
}

describe("Customer API_ORIGIN authority", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the deliberate API-port default outside production", () => {
    expect(
      resolveCustomerApiOrigin(environment(undefined, "development")),
    ).toBe(CUSTOMER_DEVELOPMENT_API_ORIGIN);
    expect(resolveCustomerApiOrigin(environment(undefined, "test"))).toBe(
      CUSTOMER_DEVELOPMENT_API_ORIGIN,
    );
  });

  it("requires an explicit production origin", () => {
    expect(() =>
      resolveCustomerApiOrigin(environment(undefined, "production")),
    ).toThrow("API_ORIGIN is required in production");
  });

  it("normalizes an explicit bare production origin", () => {
    expect(
      resolveCustomerApiOrigin(
        environment(" https://api.example.test:8443/ ", "production"),
      ),
    ).toBe("https://api.example.test:8443");
  });

  it("allows an explicit loopback production origin for a private topology", () => {
    expect(
      resolveCustomerApiOrigin(
        environment("http://127.0.0.1:3001", "production"),
      ),
    ).toBe("http://127.0.0.1:3001");
  });

  it("rejects plaintext non-loopback production API origins", () => {
    expect(() =>
      resolveCustomerApiOrigin(
        environment("http://api.example.test:3001", "production"),
      ),
    ).toThrow("production API_ORIGIN must use HTTPS unless it is an explicit loopback origin");
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
      resolveCustomerApiOrigin(environment(apiOrigin, "production")),
    ).toThrow("Customer API_ORIGIN configuration error");
  });

  it("forms the exact same-origin Guest rewrite destination", () => {
    const config = environment("http://127.0.0.1:3001", "production");
    expect(GUEST_API_REWRITE_SOURCE).toBe("/api/v1/guest/:path*");
    expect(guestApiBaseUrl(resolveCustomerApiOrigin(config))).toBe(
      "http://127.0.0.1:3001/v1/guest",
    );
    expect(guestApiRewriteDestination(config)).toBe(
      "http://127.0.0.1:3001/v1/guest/:path*",
    );
  });

  it("keeps browser traffic on the same-origin Guest path", () => {
    vi.stubEnv("API_ORIGIN", "https://private-api.example.test");
    vi.stubGlobal("window", {});
    expect(GUEST_API_BROWSER_BASE_PATH).toBe("/api/v1/guest");
    expect(getGuestApiBaseUrl()).toBe("/api/v1/guest");
  });
});
