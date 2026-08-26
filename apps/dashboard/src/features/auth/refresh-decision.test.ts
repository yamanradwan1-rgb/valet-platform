import { describe, expect, it } from "vitest";

import type { StaffAuthAccessResponse } from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  decideAuthRefreshResult,
  isSessionOverError,
} from "./refresh-decision";

function tokens(): StaffAuthAccessResponse {
  return {
    accessExpiresAt: "2025-01-01T00:10:00Z",
    accessToken: `vsa1.${"A".repeat(43)}`,
    sessionExpiresAt: "2025-01-31T00:00:00Z",
    tokenType: "Bearer",
  };
}

const OK = { ok: true, tokens: tokens() } as const;

const USER_A = { email: "manager-a@example.com" };
const USER_B = { email: "manager-b@example.com" };

function apiError(
  kind: DashboardApiError["kind"],
  code: string,
): DashboardApiError {
  return new DashboardApiError({
    code,
    kind,
    message: "failure fixture",
    status: 500,
  });
}

const AUTH_REJECTED = () =>
  apiError("session-expired", "STAFF_AUTHENTICATION_FAILED");
const NETWORK_FAILED = () => apiError("server", "NETWORK_ERROR");

describe("isSessionOverError", () => {
  it("recognizes the authoritative backend rejection", () => {
    expect(isSessionOverError(AUTH_REJECTED())).toBe(true);
  });

  it("never treats transport/server failures as session end", () => {
    expect(isSessionOverError(NETWORK_FAILED())).toBe(false);
    expect(isSessionOverError(new Error("boom"))).toBe(false);
    expect(isSessionOverError(null)).toBe(false);
  });
});

describe("decideAuthRefreshResult — live-session mode", () => {
  it("applies fresh tokens when the session snapshot is unchanged", () => {
    const decision = decideAuthRefreshResult({
      after: USER_A,
      before: USER_A,
      mode: "refresh",
      outcome: OK,
    });
    expect(decision).toEqual({ action: "apply", email: USER_A.email });
  });

  it("discards results when another principal won the race (sign-in)", () => {
    const decision = decideAuthRefreshResult({
      after: USER_B,
      before: USER_A,
      mode: "refresh",
      outcome: OK,
    });
    expect(decision).toEqual({ action: "ignore" });
  });

  it("discards results when logout cleared the session mid-flight", () => {
    const decision = decideAuthRefreshResult({
      after: null,
      before: USER_A,
      mode: "refresh",
      outcome: OK,
    });
    expect(decision).toEqual({ action: "ignore" });
  });

  it("ignores refreshes requested without a live session", () => {
    const decision = decideAuthRefreshResult({
      after: null,
      before: null,
      mode: "refresh",
      outcome: OK,
    });
    expect(decision).toEqual({ action: "ignore" });
  });

  it("ends the session only on authoritative rejection", () => {
    const decision = decideAuthRefreshResult({
      after: USER_A,
      before: USER_A,
      mode: "refresh",
      outcome: { ok: false, error: AUTH_REJECTED() },
    });
    expect(decision).toEqual({ action: "end-expired" });
  });

  it("keeps the session alive on transient failures for a near-term retry", () => {
    for (const error of [NETWORK_FAILED(), apiError("server", "INTERNAL")]) {
      const decision = decideAuthRefreshResult({
        after: USER_A,
        before: USER_A,
        mode: "refresh",
        outcome: { ok: false, error },
      });
      expect(decision).toEqual({ action: "retry-later" });
    }
  });

  it("ignores transient failures that raced a state change", () => {
    const decision = decideAuthRefreshResult({
      after: null,
      before: USER_A,
      mode: "refresh",
      outcome: { ok: false, error: NETWORK_FAILED() },
    });
    expect(decision).toEqual({ action: "ignore" });
  });
});

describe("decideAuthRefreshResult — cold restore mode", () => {
  it("applies restored tokens while nothing else claimed the slot", () => {
    const decision = decideAuthRefreshResult({
      after: null,
      before: null,
      mode: "restore",
      outcome: OK,
    });
    expect(decision).toEqual({ action: "apply", email: "" });
  });

  it("defers to an already-established session (sign-in won)", () => {
    const decision = decideAuthRefreshResult({
      after: USER_B,
      before: null,
      mode: "restore",
      outcome: OK,
    });
    expect(decision).toEqual({ action: "ignore" });
  });

  it("fails closed to sign-in when restore fails without competition", () => {
    for (const error of [AUTH_REJECTED(), NETWORK_FAILED()]) {
      const decision = decideAuthRefreshResult({
        after: null,
        before: null,
        mode: "restore",
        outcome: { ok: false, error },
      });
      expect(decision).toEqual({ action: "end-unauthenticated" });
    }
  });

  it("does not tear down a competing session on restore failure", () => {
    const decision = decideAuthRefreshResult({
      after: USER_B,
      before: null,
      mode: "restore",
      outcome: { ok: false, error: AUTH_REJECTED() },
    });
    expect(decision).toEqual({ action: "ignore" });
  });
});
