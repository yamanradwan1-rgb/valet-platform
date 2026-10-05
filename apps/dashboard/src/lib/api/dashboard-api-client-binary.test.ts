import { describe, expect, it, vi } from "vitest";

import { DashboardApiClient } from "./dashboard-api-client";
import { DashboardApiError } from "./dashboard-api-error";

function authProvider(input?: { fresh?: boolean; token?: string | null }) {
  let token = input?.token === undefined ? "token-a" : input.token;
  let identity = 3;
  let session = 5;
  let fresh = input?.fresh ?? true;
  const refresh = vi.fn(async () => {
    token = "token-b";
    fresh = true;
    session += 1;
    return {
      accessToken: `vsa1.${"a".repeat(43)}`,
      tokenType: "Bearer" as const,
      accessExpiresAt: "2099-01-01T00:00:00.000Z",
      sessionExpiresAt: "2099-02-01T00:00:00.000Z",
    };
  });
  return {
    auth: {
      getAccessToken: () => token,
      getIdentityGeneration: () => identity,
      getSessionGeneration: () => session,
      isTokenFresh: () => fresh,
      refresh,
    },
    crossIdentity: () => { identity += 1; },
    crossSession: () => { session += 1; },
    refresh,
  };
}

const csvBytes = new TextEncoder().encode("section,key,subkey,currency,value\r\n");

function artifactResponse(
  contentType = "text/csv; charset=utf-8",
  filename = "report-daily-2026-09-21.csv",
  bytes: Uint8Array = csvBytes,
) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

const body = { kind: "DAILY", format: "CSV", date: "2026-09-21" };

describe("DashboardApiClient binary POST", () => {
  it("refreshes stale auth before dispatch and sends exactly one POST", async () => {
    const state = authProvider({ fresh: false });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(artifactResponse());
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });

    const result = await api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    });

    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "include",
      body: JSON.stringify(body),
    });
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization)
      .toBe("Bearer token-b");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: "text/csv; charset=utf-8",
      "Content-Type": "application/json",
    });
    expect(result.filename).toBe("report-daily-2026-09-21.csv");
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(result.bytes).toEqual(csvBytes);
  });

  it("does not dispatch when pre-request refresh fails", async () => {
    const state = authProvider({ fresh: false, token: null });
    state.refresh.mockRejectedValueOnce(new Error("offline"));
    const fetcher = vi.fn<typeof fetch>();
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({ kind: "network", code: "NETWORK_ERROR" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not dispatch an already-aborted request", async () => {
    const state = authProvider();
    const fetcher = vi.fn<typeof fetch>();
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
      signal: controller.signal,
    })).rejects.toThrow("cancelled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reconciles a 401 without replaying the POST", async () => {
    const state = authProvider();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      code: "STAFF_AUTHENTICATION_FAILED",
      message: "expired",
      requestId: "req-export",
    }), { status: 401 }));
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });

    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({
      kind: "auth",
      code: "AUTH_RECONCILED_RETRY_REQUIRED",
    } satisfies Partial<DashboardApiError>);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("classifies a lost response after dispatch as unknown outcome", async () => {
    const state = authProvider();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection lost"));
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({
      code: "BINARY_POST_OUTCOME_UNKNOWN",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("classifies abort after dispatch as unknown outcome without replay", async () => {
    const state = authProvider();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });

    const pending = api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
      signal: controller.signal,
    });
    controller.abort(new DOMException("cancelled", "AbortError"));

    await expect(pending).rejects.toMatchObject({ code: "BINARY_POST_OUTCOME_UNKNOWN" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("classifies body-read transport loss as unknown outcome", async () => {
    const state = authProvider();
    const response = artifactResponse();
    vi.spyOn(response, "arrayBuffer").mockRejectedValue(new TypeError("body lost"));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });

    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({ code: "BINARY_POST_OUTCOME_UNKNOWN" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["text/csv; charset=utf-8", "report-weekly-2026-09-21.csv"],
    ["application/pdf", "report-weekly-2026-09-21.pdf"],
  ])("accepts exact %s and quoted server filename", async (contentType, filename) => {
    const state = authProvider();
    const expectedBytes = contentType === "application/pdf"
      ? new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
      : csvBytes;
    const api = new DashboardApiClient({
      auth: state.auth,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        artifactResponse(contentType, filename, expectedBytes),
      ),
    });
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: contentType,
    })).resolves.toEqual({ bytes: expectedBytes, contentType, filename });
  });

  it.each([
    [undefined, "attachment; filename=\"report.csv\""],
    ["text/plain", "attachment; filename=\"report.csv\""],
    ["text/csv; charset=utf-8", undefined],
    ["text/csv; charset=utf-8", "inline; filename=\"report.csv\""],
    ["text/csv; charset=utf-8", "attachment; filename=report.csv"],
    ["text/csv; charset=utf-8", "attachment; filename=\"\""],
    ["text/csv; charset=utf-8", "attachment; filename=\"../report.csv\""],
    ["text/csv; charset=utf-8", "attachment; filename=\"dir\\report.csv\""],
    ["text/csv; charset=utf-8", "attachment; filename=\"report.pdf\""],
  ])("rejects malformed artifact headers", async (contentType, disposition) => {
    const state = authProvider();
    const headers = new Headers();
    if (contentType) headers.set("Content-Type", contentType);
    if (disposition) headers.set("Content-Disposition", disposition);
    const api = new DashboardApiClient({
      auth: state.auth,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("x", { status: 200, headers })),
    });
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({ kind: "malformed", code: "MALFORMED_RESPONSE" });
  });

  it.each([
    [422, "REPORT_EXPORT_TOO_LARGE", "validation"],
    [404, "AUTHORIZATION_DENIED", "authorization"],
  ] as const)("maps %s JSON errors through the existing boundary", async (status, code, kind) => {
    const state = authProvider();
    const api = new DashboardApiClient({
      auth: state.auth,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        code,
        message: "denied",
        requestId: "req-error",
      }), { status })),
    });
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({ code, kind, status });
  });

  it.each(["identity", "session"] as const)("rejects %s generation crossing", async (kind) => {
    const state = authProvider();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (kind === "identity") state.crossIdentity();
      else state.crossSession();
      return artifactResponse();
    });
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({ kind: "auth", code: "AUTH_STATE_CHANGED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["identity", "session"] as const)(
    "rejects %s generation crossing during arrayBuffer",
    async (kind) => {
      const state = authProvider();
      const response = artifactResponse();
      vi.spyOn(response, "arrayBuffer").mockImplementation(async () => {
        if (kind === "identity") state.crossIdentity();
        else state.crossSession();
        return new Uint8Array([1, 2, 3]).buffer;
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });

      await expect(api.requestBinary("/exports", {
        body,
        expectedContentType: "text/csv; charset=utf-8",
      })).rejects.toMatchObject({ kind: "auth", code: "AUTH_STATE_CHANGED" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("does not refresh a stale 401 after the initiating generation changed", async () => {
    const state = authProvider();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      state.crossSession();
      return new Response(JSON.stringify({
        code: "STAFF_AUTHENTICATION_FAILED",
        message: "expired",
        requestId: "req-stale",
      }), { status: 401 });
    });
    const api = new DashboardApiClient({ auth: state.auth, fetch: fetcher });
    await expect(api.requestBinary("/exports", {
      body,
      expectedContentType: "text/csv; charset=utf-8",
    })).rejects.toMatchObject({ code: "AUTH_STATE_CHANGED" });
    expect(state.refresh).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
