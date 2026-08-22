import { describe, expect, it, vi } from "vitest";
import type { StaffAuthAccessResponse } from "@valet/contracts";

import { EmployeeApiError } from "../api/employee-api-errors";
import {
  classifyRefreshFailure,
  ensureAccessTokenDetailed,
  restoreStaffSession,
  StaffAuthRefreshError,
} from "./staff-auth-recovery";

function apiError(status: number, code: string): EmployeeApiError {
  return new EmployeeApiError({ code, message: `err ${code}`, status });
}

const accessResponse = (token: string): StaffAuthAccessResponse => ({
  accessToken: token,
  accessExpiresAt: "2026-08-21T04:00:00.000Z",
  sessionExpiresAt: "2026-09-20T04:00:00.000Z",
  tokenType: "Bearer",
});

describe("refresh failure classification", () => {
  it("classifies definitive rejections", () => {
    expect(classifyRefreshFailure(apiError(401, "STAFF_AUTHENTICATION_FAILED"))).toBe(
      "definitive",
    );
    expect(
      classifyRefreshFailure(apiError(500, "STAFF_AUTHENTICATION_REQUIRED")),
    ).toBe("definitive");
  });

  it("classifies transient failures", () => {
    expect(classifyRefreshFailure(apiError(500, "INTERNAL_SERVER_ERROR"))).toBe(
      "transient",
    );
    expect(classifyRefreshFailure(apiError(503, "SERVICE_UNAVAILABLE"))).toBe(
      "transient",
    );
    expect(classifyRefreshFailure(apiError(0, "NETWORK_ERROR"))).toBe("transient");
    expect(classifyRefreshFailure(new Error("boom"))).toBe("transient");
    expect(classifyRefreshFailure(undefined)).toBe("transient");
  });
});

describe("restoreStaffSession outcomes", () => {
  const fakeClient = (
    refreshImpl: (signal?: AbortSignal) => Promise<StaffAuthAccessResponse>,
  ) => ({
    getSession: () => ({ sessionExpiresAt: "2026-09-20T04:00:00.000Z" }),
    refresh: refreshImpl,
  });

  it("reports AUTHENTICATED on successful refresh", async () => {
    const result = await restoreStaffSession(
      fakeClient(() => Promise.resolve(accessResponse("tok"))),
    );
    expect(result.kind).toBe("AUTHENTICATED");
  });

  it("reports DEFINITIVE_INVALID only for definitive refresh rejection", async () => {
    const definitive = fakeClient(() =>
      Promise.reject(new StaffAuthRefreshError("definitive", apiError(401, "STAFF_AUTHENTICATION_FAILED"))),
    );
    const transient = fakeClient(() =>
      Promise.reject(new StaffAuthRefreshError("transient", apiError(500, "INTERNAL_SERVER_ERROR"))),
    );
    expect((await restoreStaffSession(definitive)).kind).toBe(
      "DEFINITIVE_INVALID",
    );
    expect((await restoreStaffSession(transient)).kind).toBe(
      "REFRESH_UNAVAILABLE",
    );
  });

  it("treats unexpected errors as transient unavailability with a truthful message", async () => {
    const result = await restoreStaffSession(
      fakeClient(() => Promise.reject(new Error("socket hang up"))),
    );
    expect(result.kind).toBe("REFRESH_UNAVAILABLE");
    if (result.kind === "REFRESH_UNAVAILABLE") {
      expect(result.message).toContain("temporarily unavailable");
    }
  });
});

describe("ensureAccessTokenDetailed", () => {
  const tokenClient = (
    overrides: Partial<{
      getAccessToken(): string | null;
      isTokenFresh(bufferSeconds?: number): boolean;
      refresh(signal?: AbortSignal): Promise<StaffAuthAccessResponse>;
    }> = {},
  ) => ({
    getAccessToken: () => "stale-token",
    isTokenFresh: () => false,
    refresh: () => Promise.resolve(accessResponse("fresh-token")),
    ...overrides,
  });

  it("short-circuits when the token is fresh without refreshing", async () => {
    const refresh = vi.fn(() => Promise.resolve(accessResponse("x")));
    const outcome = await ensureAccessTokenDetailed(
      tokenClient({ getAccessToken: () => "cached", isTokenFresh: () => true, refresh }),
    );
    expect(outcome.token).toBe("cached");
    expect(outcome.failureKind).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns the refreshed token on success and the failure kind on definitive rejection", async () => {
    const ok = await ensureAccessTokenDetailed(tokenClient());
    expect(ok.token).toBe("fresh-token");

    const definitive = await ensureAccessTokenDetailed(
      tokenClient({
        refresh: () =>
          Promise.reject(
            new StaffAuthRefreshError("definitive", apiError(401, "STAFF_AUTHENTICATION_FAILED")),
          ),
      }),
    );
    expect(definitive.token).toBeNull();
    expect(definitive.failureKind).toBe("definitive");

    const transient = await ensureAccessTokenDetailed(
      tokenClient({
        refresh: () =>
          Promise.reject(new EmployeeApiError({ code: "NETWORK_ERROR", message: "offline", status: 0 })),
      }),
    );
    expect(transient.token).toBeNull();
    expect(transient.failureKind).toBe("transient");
  });
});
