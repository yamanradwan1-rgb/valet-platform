import { describe, expect, it } from "vitest";

import {
  guestRequestPolicy,
  guestRouteClasses,
  guestRatePolicyMode,
} from "../src/modules/guest-access/guest-request-policy";
import { runtimePostgresPolicy } from "../src/common/database/runtime-postgres-policy";
import { mapApiError } from "../src/common/http/api-errors";

describe("T3 derived envelope and finite capacity", () => {
  it("defaults production to the conservative mixed-version floor and rejects unknown modes", () => {
    expect(guestRatePolicyMode({ NODE_ENV: "production" })).toBe(
      "COMPATIBILITY",
    );
    expect(guestRatePolicyMode({ NODE_ENV: "test" })).toBe("ACTIVE");
    expect(() =>
      guestRatePolicyMode({ GUEST_T3_RATE_POLICY: "bad" }),
    ).toThrow();
  });
  it("supports two legacy tabs plus every bounded extra demand with 2x headroom", () => {
    expect(2 * (900 / 5) + 2 + 6 + 6 + 6 + 12).toBe(392);
    for (const requestClass of ["A", "B", "C", "D"] as const) {
      expect(guestRequestPolicy.classes[requestClass]).toBeGreaterThanOrEqual(
        2 * guestRequestPolicy.envelope[requestClass],
      );
    }
    expect(guestRequestPolicy.aggregate).toBeGreaterThanOrEqual(
      2 * (392 + 16 + 16 + 2),
    );
    expect(guestRequestPolicy.enrollmentAllocations).toBe(2 * 1000 * 2);
    expect(guestRequestPolicy.sourceFailures).toBe(60);
    expect(guestRequestPolicy.unknownCredential).toBe(180);
  });

  it("maps every actual Guest surface without separate transport quotas", () => {
    expect(Object.keys(guestRouteClasses)).toHaveLength(17);
    expect(
      Object.values(guestRouteClasses).filter((value) => value === "A"),
    ).toHaveLength(4);
    expect(
      Object.values(guestRouteClasses).filter((value) => value === "D"),
    ).toHaveLength(2);
    expect(
      guestRouteClasses["POST /v1/guest/browser-session/switch/reconcile"],
    ).toBe("B");
    expect(guestRouteClasses["GET /v1/guest/information"]).toBe("A");
  });

  it("requires real production capacity inputs and includes rollout surge", () => {
    expect(() => runtimePostgresPolicy({ NODE_ENV: "production" })).toThrow();
    const supplied = {
      DATABASE_GENERAL_LOCK_MS: "5000",
      DATABASE_GENERAL_STATEMENT_MS: "15000",
      DATABASE_GENERAL_TRANSACTION_MS: "30000",
      DATABASE_GENERAL_IDLE_TRANSACTION_MS: "10000",
      NODE_ENV: "production",
      DATABASE_POOL_MAX: "8",
      DATABASE_ALLOWED_CONNECTIONS: "100",
      DATABASE_RESERVED_CONNECTIONS: "36",
      DATABASE_MAX_API_INSTANCES: "8",
    };
    expect(runtimePostgresPolicy(supplied).config.max).toBe(8);
    expect(() =>
      runtimePostgresPolicy({ ...supplied, DATABASE_POOL_MAX: "9" }),
    ).toThrow();
    expect(() =>
      runtimePostgresPolicy({ ...supplied, DATABASE_POOL_MAX: "0" }),
    ).toThrow();
    expect(
      runtimePostgresPolicy({ NODE_ENV: "test" }).config
        .connectionTimeoutMillis,
    ).toBe(2000);
  });

  it.each([
    "53300",
    "40P01",
    "55P03",
    "57014",
    "25P03",
    "25P04",
    "57P01",
    "ECONNRESET",
  ])("maps expected resource exhaustion %s to a generic 503", (code) => {
    expect(mapApiError({ code, message: "private database secret" })).toEqual({
      code: "INTERNAL_ERROR",
      message: "Service temporarily unavailable.",
      status: 503,
    });
  });

  it("maps pg transport disconnection without an SQLSTATE to unavailable", () => {
    expect(
      mapApiError(new Error("Connection terminated unexpectedly")),
    ).toEqual({
      code: "INTERNAL_ERROR",
      message: "Service temporarily unavailable.",
      status: 503,
    });
  });
});
