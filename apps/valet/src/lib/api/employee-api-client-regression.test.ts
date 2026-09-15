import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaffAuthClient } from "../auth/staff-auth-client";
import { EmployeeApiClient } from "./employee-api-client";
import { EmployeeApiError } from "./employee-api-errors";

const ACCESS_TOKEN = "vsa1.0123456789012345678901234567890123456789012";
const REFRESHED_TOKEN = "vsa1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function refreshResponse(accessToken = REFRESHED_TOKEN) {
  return {
    accessExpiresAt: "2026-09-03T12:00:00.000Z",
    accessToken,
    sessionExpiresAt: "2026-10-03T12:00:00.000Z",
    tokenType: "Bearer" as const,
  };
}

describe("EmployeeApiClient Web behavior preservation", () => {
  let authClient: StaffAuthClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    authClient = new StaffAuthClient();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function useFreshToken(token = ACCESS_TOKEN): void {
    vi.spyOn(authClient, "isTokenFresh").mockReturnValue(true);
    vi.spyOn(authClient, "getAccessToken").mockReturnValue(token);
  }

  it("keeps requireAuth false free of token lookup and proactive refresh", async () => {
    const freshSpy = vi.spyOn(authClient, "isTokenFresh");
    const tokenSpy = vi.spyOn(authClient, "getAccessToken");
    const refreshSpy = vi.spyOn(authClient, "refresh");
    let headers: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return jsonResponse({ public: true });
    });

    const result = await new EmployeeApiClient({ authClient }).request(
      "/v1/public",
      { requireAuth: false },
    );

    expect(result).toEqual({ public: true });
    expect(headers["Authorization"]).toBeUndefined();
    expect(freshSpy).not.toHaveBeenCalled();
    expect(tokenSpy).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("keeps skipProactiveRefresh on the current token without refreshing", async () => {
    const freshSpy = vi.spyOn(authClient, "isTokenFresh");
    const tokenSpy = vi
      .spyOn(authClient, "getAccessToken")
      .mockReturnValue(ACCESS_TOKEN);
    const refreshSpy = vi.spyOn(authClient, "refresh");
    let headers: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return jsonResponse({ ok: true });
    });

    await new EmployeeApiClient({ authClient }).request("/v1/staff/tasks", {
      skipProactiveRefresh: true,
    });

    expect(headers["Authorization"]).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(freshSpy).not.toHaveBeenCalled();
    expect(tokenSpy).toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("keeps proactive refresh before sending a stale authenticated request", async () => {
    vi.spyOn(authClient, "isTokenFresh").mockReturnValue(false);
    vi.spyOn(authClient, "getAccessToken").mockReturnValue(REFRESHED_TOKEN);
    const refreshSpy = vi
      .spyOn(authClient, "refresh")
      .mockResolvedValue(refreshResponse());
    let headers: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return jsonResponse({ ok: true });
    });

    await new EmployeeApiClient({ authClient }).request("/v1/staff/tasks");

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(headers["Authorization"]).toBe(`Bearer ${REFRESHED_TOKEN}`);
  });

  it.each(["GET", "HEAD"] as const)(
    "retries %s exactly once after repeated 401 responses",
    async (method) => {
      useFreshToken();
      const authLoss = vi.fn();
      const refreshSpy = vi
        .spyOn(authClient, "refresh")
        .mockResolvedValue(refreshResponse());
      globalThis.fetch = vi.fn(async () =>
        jsonResponse({ code: "STAFF_AUTHENTICATION_REQUIRED" }, 401),
      );

      await expect(
        new EmployeeApiClient({
          authClient,
          onAuthorizationLoss: authLoss,
        }).request("/v1/staff/tasks", { method }),
      ).rejects.toMatchObject({ status: 401 });

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(authLoss).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "never refreshes or replays a %s mutation",
    async (method) => {
      useFreshToken();
      const refreshSpy = vi.spyOn(authClient, "refresh");
      globalThis.fetch = vi.fn(async () =>
        jsonResponse({ code: "STAFF_AUTHENTICATION_REQUIRED" }, 401),
      );

      await expect(
        new EmployeeApiClient({ authClient }).request("/v1/staff/mutation", {
          method,
        }),
      ).rejects.toMatchObject({ status: 401 });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(refreshSpy).not.toHaveBeenCalled();
    },
  );

  it.each([403, 404])(
    "preserves operational denial for a %s response without reporting credential loss",
    async (status) => {
      useFreshToken();
      const authLoss = vi.fn();
      globalThis.fetch = vi.fn(async () =>
        jsonResponse({ code: "AUTHORIZATION_DENIED" }, status),
      );

      await expect(
        new EmployeeApiClient({
          authClient,
          onAuthorizationLoss: authLoss,
        }).request("/v1/staff/mutation", { method: "POST" }),
      ).rejects.toMatchObject({ status });

      expect(authLoss).not.toHaveBeenCalled();
    },
  );

  it("reports credential loss for a 401 mutation without replaying it", async () => {
    useFreshToken();
    const authLoss = vi.fn();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: "STAFF_AUTHENTICATION_REQUIRED" }, 401),
    );

    await expect(
      new EmployeeApiClient({
        authClient,
        onAuthorizationLoss: authLoss,
      }).request("/v1/staff/mutation", { method: "POST" }),
    ).rejects.toMatchObject({ status: 401 });

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(authLoss).toHaveBeenCalledOnce();
  });

  it("preserves body, query, custom headers, URL joining, and fetch policy", async () => {
    useFreshToken();
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return jsonResponse({ ok: true });
    });

    await new EmployeeApiClient({
      authClient,
      baseUrl: "https://employee.example",
    }).request("v1/staff/tasks", {
      body: { plateNumber: "12-34567" },
      headers: { "X-Request-ID": "req-1" },
      method: "POST",
      params: { active: true, empty: null, page: 2, skip: undefined },
    });

    expect(capturedUrl).toBe(
      "https://employee.example/v1/staff/tasks?active=true&page=2",
    );
    expect(capturedInit).toMatchObject({
      body: JSON.stringify({ plateNumber: "12-34567" }),
      cache: "no-store",
      credentials: "include",
      method: "POST",
    });
    expect(capturedInit?.headers).toEqual({
      Accept: "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Request-ID": "req-1",
    });
  });

  it.each([
    ["empty", new Response("", { status: 200 }), {}],
    ["non-JSON", new Response("not-json", { status: 200 }), "not-json"],
  ])(
    "preserves %s successful response parsing",
    async (_name, response, value) => {
      useFreshToken();
      globalThis.fetch = vi.fn().mockResolvedValue(response);

      const result = await new EmployeeApiClient({ authClient }).request(
        "/v1/staff/tasks",
      );

      expect(result).toEqual(value);
    },
  );

  it("normalizes network failures", async () => {
    useFreshToken();
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));

    await expect(
      new EmployeeApiClient({ authClient }).request("/v1/staff/tasks"),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      isNetworkError: true,
      status: 0,
    });
  });

  it("preserves the original cancellation error and AbortSignal", async () => {
    useFreshToken();
    const controller = new AbortController();
    const cancellation = new DOMException("cancelled", "AbortError");
    let capturedSignal: AbortSignal | null | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedSignal = init?.signal;
      controller.abort(cancellation);
      throw cancellation;
    });

    await expect(
      new EmployeeApiClient({ authClient }).request("/v1/staff/tasks", {
        signal: controller.signal,
      }),
    ).rejects.toBe(cancellation);
    expect(capturedSignal).toBe(controller.signal);
  });

  it("preserves authorization loss for an unclassified refresh failure", async () => {
    useFreshToken();
    const authLoss = vi.fn();
    vi.spyOn(authClient, "refresh").mockRejectedValue(new Error("unexpected"));
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: "STAFF_AUTHENTICATION_REQUIRED" }, 401),
    );

    await expect(
      new EmployeeApiClient({
        authClient,
        onAuthorizationLoss: authLoss,
      }).request("/v1/staff/tasks"),
    ).rejects.toBeInstanceOf(EmployeeApiError);
    expect(authLoss).toHaveBeenCalledTimes(1);
  });
});
