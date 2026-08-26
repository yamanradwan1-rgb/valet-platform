import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApiError } from "./api-error";
import { StaffApiClient } from "./staff-api-client";
import { resetCrossTabSessionBus } from "../../features/auth/cross-tab-session";
import { runSingleFlightRefresh } from "../../features/auth/auth-runtime";

/**
 * Recovery-posture regressions for the shared staff transport (D5-001).
 *
 * Reproduces three audited defects against the frozen HEAD wiring:
 *
 * 1. DEADLOCK: a 401 arriving FROM `/auth/refresh` itself re-entered
 *    unauthorized recovery, which joined the very single-flight refresh
 *    whose in-flight `client.refresh()` had thrown — a four-promise cycle
 *    (flight → refresh → recovery → flight) that never settles. Cold
 *    restore wedged in "restoring" forever (sign-in disabled), and
 *    authoritative expiry could never reach endSession.
 * 2. SPURIOUS PROBE: login/logout 401s routed through unauthorized
 *    recovery, issuing a wasted cookie-touching `/auth/refresh` probe
 *    (and, in a real browser, a nested same-name Web Lock acquisition
 *    while `signIn` held the auth mutation lock — a hard hang).
 * 3. DISHONEST TRANSIENT COPY: when recovery resolved null because the
 *    refresh failed TRANSIENTLY (session still live, near-term retry
 *    scheduled), the ORIGINAL session-expired error was rethrown, so
 *    feature surfaces rendered "session expired" / eternal restoring
 *    loaders although the shell would never redirect.
 *
 * The contract after the fix:
 * - requests with `skipAuthorization` (login/refresh/logout) NEVER invoke
 *   recovery and never trigger extra fetches;
 * - a data-request 401 whose recovery ends authoritatively rethrows the
 *   original error;
 * - a data-request 401 whose recovery resolves null while the session is
 *   STILL LIVE surfaces a retryable server error instead of fake expiry.
 */

const BASE = "http://test-api/v1/staff";
const VALID_TOKEN = `vsa1.${"B".repeat(43)}`;

function jsonResponse(
  status: number,
  body: unknown,
): { ok: boolean; status: number; text: () => Promise<string> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

interface RecordedCall {
  readonly path: string;
}

function stubAlwaysUnauthorized(): { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) => {
      calls.push({ path });
      return jsonResponse(401, { code: "STAFF_AUTHENTICATION_FAILED" });
    }),
  );
  return { calls };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}

/** Resolves "SETTLED" with the outcome or "HUNG" if it never settles. */
async function settleOrHang(
  promise: Promise<unknown>,
): Promise<"HUNG" | "SETTLED"> {
  let hung = false;
  const timer = new Promise<"HUNG">((resolve) => {
    setTimeout(() => {
      hung = true;
      resolve("HUNG");
    }, 150);
  });
  const outcome = await Promise.race([
    timer,
    promise.then(() => {
      if (hung) return "HUNG";
      return "SETTLED";
    }),
  ]);
  return outcome;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetCrossTabSessionBus();
});

describe("provider-wired restore against a permanently-401 refresh endpoint", () => {
  it("converges instead of deadlocking the single-flight refresh", async () => {
    stubAlwaysUnauthorized();
    let currentToken: string | null = null;
    const recover = (): Promise<string | null> =>
      // Mirror AuthProvider.refreshSession: join the active single flight.
      runSingleFlightRefresh(async (): Promise<string | null> => {
        try {
          const tokens = await client.refresh();
          currentToken = tokens.accessToken;
          return tokens.accessToken;
        } catch {
          // Authoritative/transient failure decision collapses to null.
          return null;
        }
      });
    const client = new StaffApiClient({
      baseUrl: BASE,
      getAccessToken: () => currentToken,
      recoverFromUnauthorized: recover,
    });

    const outcome = await settleOrHang(
      (async () => {
        try {
          await client.request("/dashboard/overview");
        } catch {
          // Surface error identity asserted below by callers; irrelevant here.
        }
      })(),
    );

    expect(outcome).toBe("SETTLED");
  });
});

describe("skipAuthorization endpoints never enter unauthorized recovery", () => {
  it("login 401 propagates without any recovery probe or extra fetch", async () => {
    const { calls } = stubAlwaysUnauthorized();
    let recoveryInvocations = 0;
    const client = new StaffApiClient({
      baseUrl: BASE,
      getAccessToken: () => null,
      recoverFromUnauthorized: () => {
        recoveryInvocations += 1;
        return Promise.resolve(null);
      },
    });

    const error = await caught(
      client.login({ email: "manager@example.com", password: "wrong" }),
    );

    expect(recoveryInvocations).toBe(0);
    expect(calls.map((entry) => entry.path)).toEqual([`${BASE}/auth/login`]);
    expect(error).toBeInstanceOf(DashboardApiError);
    expect((error as DashboardApiError).kind).toBe("session-expired");
  });

  it("logout 401 propagates without any recovery probe or extra fetch", async () => {
    const { calls } = stubAlwaysUnauthorized();
    let recoveryInvocations = 0;
    const client = new StaffApiClient({
      baseUrl: BASE,
      getAccessToken: () => VALID_TOKEN,
      recoverFromUnauthorized: () => {
        recoveryInvocations += 1;
        return Promise.resolve(null);
      },
    });

    await caught(client.logout());

    expect(recoveryInvocations).toBe(0);
    expect(calls.map((entry) => entry.path)).toEqual([`${BASE}/auth/logout`]);
  });
});

describe("transient recovery failure keeps the session honest per request", () => {
  it("rethrows the ORIGINAL expiry when recovery ended the session", async () => {
    stubAlwaysUnauthorized();
    let currentToken: string | null = VALID_TOKEN;
    const client = new StaffApiClient({
      baseUrl: BASE,
      getAccessToken: () => currentToken,
      recoverFromUnauthorized: () => {
        // Authoritative end: runtime teardown already cleared the token.
        currentToken = null;
        return Promise.resolve(null);
      },
    });

    const error = await caught(client.request("/dashboard/overview"));

    expect(error).toBeInstanceOf(DashboardApiError);
    expect((error as DashboardApiError).kind).toBe("session-expired");
  });

  it("surfaces a RETRYABLE server error when the session survived a transient recovery failure", async () => {
    stubAlwaysUnauthorized();
    const currentToken: string | null = VALID_TOKEN;
    const client = new StaffApiClient({
      baseUrl: BASE,
      getAccessToken: () => currentToken,
      recoverFromUnauthorized: () => {
        // retry-later posture: token untouched, near-term refresh scheduled.
        return Promise.resolve(null);
      },
    });

    const error = await caught(client.request("/dashboard/overview"));

    expect(error).toBeInstanceOf(DashboardApiError);
    const apiError = error as DashboardApiError;
    expect(apiError.kind).not.toBe("session-expired");
    expect(apiError.kind).toBe("server");
    expect(apiError.code).toBe("SESSION_RECOVERY_RETRY_SCHEDULED");
  });
});
