import { describe, expect, it } from "vitest";

import { DashboardApiError } from "./api-error";
import {
  BASE,
  binaryResponse,
  caught,
  CSV_BYTES,
  jsonResponse,
  makeClient,
  PDF_BYTES,
  stubFetch,
  VALID_TOKEN,
} from "./staff-api-client-binary-test-support";

/**
 * Binary success + auth recovery transport tests (D4-002 report exports).
 * The binary path preserves the shared auth model exactly: bearer
 * injection, one recovery retry on a session-expired 401, and no retry
 * loop on a second 401.
 */

describe("binary success transport", () => {
  it("downloads CSV bytes with bearer injection and exact single-prefix URL", async () => {
    const { calls } = stubFetch(() =>
      binaryResponse({
        contentType: "text/csv; charset=utf-8",
        contentDisposition: 'attachment; filename="report-daily-2026-01-30.csv"',
        body: CSV_BYTES,
      }),
    );
    const { client } = makeClient({ token: VALID_TOKEN });

    const result = await client.requestBinary(
      "/dashboard/locations/loc-1/reports/exports",
      {
        body: { date: "2026-01-30", format: "CSV", kind: "DAILY" },
        method: "POST",
      },
    );

    expect(result.bytes).toEqual(CSV_BYTES);
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(result.contentDisposition).toBe(
      'attachment; filename="report-daily-2026-01-30.csv"',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe(
      `${BASE}/dashboard/locations/loc-1/reports/exports`,
    );
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${VALID_TOKEN}`);
    expect(headers["Accept"]).toBe("text/csv, application/pdf");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      kind: "DAILY",
      format: "CSV",
      date: "2026-01-30",
    });
  });

  it("returns PDF bytes untouched", async () => {
    stubFetch(() =>
      binaryResponse({ contentType: "application/pdf", body: PDF_BYTES }),
    );
    const { client } = makeClient({ token: VALID_TOKEN });

    const result = await client.requestBinary("/dashboard/artifact");
    expect(result.bytes).toEqual(PDF_BYTES);
    expect(result.contentType).toBe("application/pdf");
  });

  it("exposes null headers truthfully when the backend omits them", async () => {
    stubFetch(() => binaryResponse({}));
    const { client } = makeClient();

    const result = await client.requestBinary("/dashboard/artifact");
    expect(result.contentType).toBeNull();
    expect(result.contentDisposition).toBeNull();
  });

  it("sends without a bearer header when no token is available", async () => {
    const { calls } = stubFetch(() => binaryResponse({}));
    const { client } = makeClient({ token: null });

    await client.requestBinary("/dashboard/artifact");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("binary auth recovery semantics", () => {
  it("retries a 401 export exactly once after recovery and succeeds", async () => {
    let call = 0;
    const { calls } = stubFetch(() => {
      call += 1;
      return call === 1
        ? jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" })
        : binaryResponse({ contentType: "application/pdf", body: PDF_BYTES });
    });
    const { client, recoveryCalls } = makeClient({
      token: "stale",
      recover: async () => VALID_TOKEN,
    });

    const result = await client.requestBinary("/dashboard/artifact");
    expect(result.bytes).toEqual(PDF_BYTES);
    expect(calls).toHaveLength(2);
    // The retried attempt carries the refreshed token.
    const retryHeaders = calls[1]?.init.headers as Record<string, string>;
    expect(retryHeaders["Authorization"]).toBe(`Bearer ${VALID_TOKEN}`);
    expect(recoveryCalls).toHaveLength(1);
  });

  it("rethrows the original 401 when recovery resolves null — no retry", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" }),
    );
    const { client, recoveryCalls } = makeClient({ token: "stale" });

    const thrown = await caught(client.requestBinary("/dashboard/artifact"));
    expect(thrown).toBeInstanceOf(DashboardApiError);
    expect((thrown as DashboardApiError).kind).toBe("session-expired");
    expect(calls).toHaveLength(1);
    expect(recoveryCalls).toHaveLength(1);
  });

  it("never loops when the retried download is rejected with 401 again", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" }),
    );
    const { client, recoveryCalls } = makeClient({
      token: "stale",
      recover: async () => VALID_TOKEN,
    });

    const thrown = await caught(client.requestBinary("/dashboard/artifact"));
    expect((thrown as DashboardApiError).kind).toBe("session-expired");
    // Two data attempts (original + single retry), exactly ONE refresh.
    expect(calls).toHaveLength(2);
    expect(recoveryCalls).toHaveLength(1);
  });

  it("surfaces transient recovery failures verbatim instead of faking expiry", async () => {
    stubFetch(() =>
      jsonResponse(401, { code: "STAFF_AUTHENTICATION_REQUIRED" }),
    );
    const { client } = makeClient({
      token: "stale",
      recover: () => Promise.reject(new TypeError("refresh failed")),
    });

    const thrown = await caught(client.requestBinary("/dashboard/artifact"));
    expect(thrown).not.toBeInstanceOf(DashboardApiError);
  });

  it("never invokes recovery for non-401 failures", async () => {
    for (const [status, body] of [
      [403, { code: "ROLE_FORBIDDEN" }],
      [404, { code: "LOCATION_ACCESS_DENIED" }],
      [422, { code: "REPORT_EXPORT_TOO_LARGE" }],
    ] as const) {
      const { calls } = stubFetch(() => jsonResponse(status, body));
      const { client, recoveryCalls } = makeClient({ token: VALID_TOKEN });
      await caught(client.requestBinary("/dashboard/artifact"));
      expect(calls).toHaveLength(1);
      expect(recoveryCalls).toHaveLength(0);
    }
  });
});
