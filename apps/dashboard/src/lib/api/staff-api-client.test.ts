import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApiError, mapNetworkError } from "./api-error";
import { StaffApiClient } from "./staff-api-client";

const BASE = "http://test-api/v1/staff";
const VALID_TOKEN = `vsa1.${"A".repeat(43)}`;

interface RecordedCall {
  readonly path: string;
  readonly init: RequestInit;
}

type FetchStub = (path: string, init?: RequestInit) => unknown;

function stubFetch(handler: FetchStub): { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      calls.push({ init: init ?? {}, path });
      return handler(path, init);
    }),
  );
  return { calls };
}

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

function emptyResponse(status: number): {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
} {
  return { ok: status >= 200 && status < 300, status, text: async () => "" };
}

function accessPayload(accessToken: string): unknown {
  return {
    accessExpiresAt: "2025-01-01T00:10:00Z",
    accessToken,
    sessionExpiresAt: "2025-01-31T00:00:00Z",
    tokenType: "Bearer",
  };
}

interface ClientHarness {
  client: StaffApiClient;
  recoveryCalls: unknown[];
}

function makeClient(options?: {
  token?: string | null;
  recover?: () => Promise<string | null>;
}): ClientHarness {
  const recoveryCalls: unknown[] = [];
  const client = new StaffApiClient({
    baseUrl: BASE,
    getAccessToken: () => options?.token ?? null,
    recoverFromUnauthorized: async () => {
      recoveryCalls.push("recovery-requested");
      if (options?.recover === undefined) return null;
      return options.recover();
    },
  });
  return { client, recoveryCalls };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("401 recovery retry semantics", () => {
  it("retries the data request exactly once with the refreshed token", async () => {
    let call = 0;
    const { calls } = stubFetch(() => {
      call += 1;
      return call === 1
        ? jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" })
        : jsonResponse(200, { value: 42 });
    });
    const { client, recoveryCalls } = makeClient({
      recover: async () => VALID_TOKEN,
    });

    await expect(client.request("/dashboard/anything")).resolves.toEqual({
      value: 42,
    });

    expect(calls).toHaveLength(2);
    expect(calls.map((entry) => entry.path)).toEqual([
      `${BASE}/dashboard/anything`,
      `${BASE}/dashboard/anything`,
    ]);
    expect(recoveryCalls).toHaveLength(1);
  });

  it("rethrows the original 401 when refresh fails authoritatively", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" }),
    );
    const { client, recoveryCalls } = makeClient();

    const thrown = await caught(client.request("/dashboard/anything"));

    expect(thrown).toBeInstanceOf(DashboardApiError);
    expect((thrown as DashboardApiError).kind).toBe("session-expired");
    // Exactly one data attempt and one recovery — never a retry loop.
    expect(calls).toHaveLength(1);
    expect(recoveryCalls).toHaveLength(1);
  });

  it("never refreshes twice when the retried request is rejected again", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" }),
    );
    const { client, recoveryCalls } = makeClient({
      recover: async () => VALID_TOKEN,
    });

    const thrown = await caught(client.request("/dashboard/anything"));

    expect(thrown).toBeInstanceOf(DashboardApiError);
    expect((thrown as DashboardApiError).kind).toBe("session-expired");
    // Two data attempts (original + single retry), exactly ONE refresh.
    expect(calls).toHaveLength(2);
    expect(recoveryCalls).toHaveLength(1);
  });

  it("surfaces a transient refresh failure verbatim instead of faking expiry", async () => {
    stubFetch(() =>
      jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" }),
    );
    const transient = mapNetworkError();
    const { client } = makeClient({
      recover: () => Promise.reject(transient),
    });

    await expect(client.request("/dashboard/anything")).rejects.toBe(transient);
  });

  it("never invokes recovery for non-401 failures", async () => {
    for (const [status, body] of [
      [403, { code: "ROLE_FORBIDDEN" }],
      [404, { code: "LOCATION_ACCESS_DENIED" }],
      [409, { code: "EXPECTED_VERSION_MISMATCH" }],
      [429, { code: "RATE_LIMITED", retryAfter: 30 }],
    ] as const) {
      const { calls } = stubFetch(() => jsonResponse(status, body));
      const { client, recoveryCalls } = makeClient();
      await caught(client.request("/dashboard/anything"));
      expect(calls).toHaveLength(1);
      expect(recoveryCalls).toHaveLength(0);
    }
  });
});

describe("transport failure mapping", () => {
  it("maps fetch rejections to an honest retryable network failure", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    const { client } = makeClient();

    const error = await caught(client.request("/dashboard/anything"));
    expect(error).toBeInstanceOf(DashboardApiError);
    const apiError = error as DashboardApiError;
    expect(apiError.code).toBe("NETWORK_ERROR");
    expect(apiError.isNetworkError).toBe(true);
    expect(apiError.kind).not.toBe("session-expired");
  });

  it("preserves caller aborts instead of masking them as network errors", async () => {
    const controller = new AbortController();
    stubFetch(() => {
      controller.abort();
      return Promise.reject(new Error("The operation was aborted."));
    });
    const { client } = makeClient();

    await expect(
      client.request("/dashboard/anything", { signal: controller.signal }),
    ).rejects.not.toBeInstanceOf(DashboardApiError);
  });

  it("classifies authorization-masked 404 separately from plain not-found", async () => {
    for (const [code, expected] of [
      ["LOCATION_ACCESS_DENIED", "authorization-masked"],
      ["TENANT_ACCESS_DENIED", "authorization-masked"],
      ["AUTHORIZATION_DENIED", "authorization-masked"],
      ["SOME_OTHER_MISSING", "not-found"],
    ] as const) {
      stubFetch(() => jsonResponse(404, { code }));
      const { client } = makeClient();
      const error = await caught(client.request("/dashboard/anything"));
      expect((error as DashboardApiError).kind).toBe(expected);
    }
  });
});

describe("auth boundary requests", () => {
  it("login posts strict credentials without a bearer header", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(200, accessPayload(VALID_TOKEN)),
    );
    const { client } = makeClient();

    await client.login({
      email: "  Manager@Example.com ",
      password: "secret",
    });

    expect(calls).toHaveLength(1);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
    // Contract normalization: trimmed + lowercased exactly once.
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      email: "manager@example.com",
      password: "secret",
    });
  });

  it("rejects contract-invalid login payloads before any network traffic", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(200, accessPayload(VALID_TOKEN)),
    );
    const { client } = makeClient();

    const error = await caught(client.login({
      email: "not-an-email",
      password: "secret",
    }));
    expect((error as Error).name).toBe("ZodError");
    expect(calls).toHaveLength(0);
  });

  it("validates the refresh response against the shared contract", async () => {
    stubFetch(() => jsonResponse(200, accessPayload("not-a-staff-token")));
    const { client } = makeClient();

    const error = await caught(client.refresh());
    expect((error as Error).name).toBe("ZodError");
  });

  it("refresh and logout carry no bearer token and an empty JSON body", async () => {
    const { calls } = stubFetch((path) =>
      path === `${BASE}/auth/refresh`
        ? jsonResponse(200, accessPayload(VALID_TOKEN))
        : emptyResponse(204),
    );
    const { client } = makeClient({ token: "stale-token" });

    await client.refresh();
    await client.logout();

    expect(calls.map((entry) => entry.path)).toEqual([
      `${BASE}/auth/refresh`,
      `${BASE}/auth/logout`,
    ]);
    for (const call of calls) {
      const headers = call.init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
      expect(JSON.parse(String(call.init.body))).toEqual({});
    }
  });

  it("logout resolves on HTTP 204 with an empty body", async () => {
    stubFetch(() => emptyResponse(204));
    const { client } = makeClient();
    await expect(client.logout()).resolves.toBeUndefined();
  });
});
