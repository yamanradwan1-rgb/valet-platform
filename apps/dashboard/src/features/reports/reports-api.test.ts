import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  buildReportExportRequest,
  exportReport,
  loadReport,
} from "./reports-api";
import { dailyResponseFor, weeklyResponseFor, LOCATION_A } from "./reports-test-support";

/**
 * Transport truth tests (D4-002). Paths are StaffApiClient-relative; the
 * shared base URL adds the single /v1/staff prefix. Outgoing queries must
 * be contract-valid BEFORE any network traffic and responses must strictly
 * match the shared report schemas — drift is an honest typed failure.
 */

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}

interface RecordedRequest {
  readonly init:
    | { readonly body?: unknown; readonly method?: string }
    | undefined;
  readonly path: string;
}

function recordingReadClient(payload: unknown): {
  calls: RecordedRequest[];
  client: Parameters<typeof loadReport>[0];
} {
  const calls: RecordedRequest[] = [];
  const client = {
    async request<T>(path: string, init?: Record<string, unknown>): Promise<T> {
      calls.push({ init, path });
      return payload as T;
    },
  };
  return { calls, client: client as unknown as Parameters<typeof loadReport>[0] };
}

describe("read paths and queries", () => {
  it("daily uses the exact path/query shape", async () => {
    const { calls, client } = recordingReadClient(dailyResponseFor(LOCATION_A));
    await loadReport(client, {
      kind: "DAILY",
      locationId: LOCATION_A,
      periodValue: "2026-01-30",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_A}/reports/daily?date=2026-01-30`,
    );
  });

  it("weekly uses weekStart exactly", async () => {
    const { calls, client } = recordingReadClient(
      weeklyResponseFor(LOCATION_A),
    );
    await loadReport(client, {
      kind: "WEEKLY",
      locationId: LOCATION_A,
      periodValue: "2026-01-05",
    });
    expect(calls[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_A}/reports/weekly?weekStart=2026-01-05`,
    );
  });

  it("monthly uses month exactly", async () => {
    const { calls, client } = recordingReadClient(
      weeklyResponseFor(LOCATION_A),
    );
    await loadReport(client, {
      kind: "MONTHLY",
      locationId: LOCATION_A,
      periodValue: "2026-01",
    });
    expect(calls[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_A}/reports/monthly?month=2026-01`,
    );
  });

  it("rejects a format-invalid period before any network traffic", async () => {
    // Layering truth: the shared Zod queries pin FORMAT; deeper calendar
    // rules (impossible dates, Monday weekStart) are backend-owned and are
    // gated in the UX by reports-period validators instead.
    const { calls, client } = recordingReadClient(null);
    for (const identity of [
      { kind: "DAILY" as const, locationId: LOCATION_A, periodValue: "20260130" },
      { kind: "WEEKLY" as const, locationId: LOCATION_A, periodValue: "not-a-date" },
      { kind: "MONTHLY" as const, locationId: LOCATION_A, periodValue: "2026-1" },
    ]) {
      const error = await caught(loadReport(client, identity));
      expect(error).toBeInstanceOf(DashboardApiError);
      expect((error as DashboardApiError).code).toBe(
        "REPORTS_PERIOD_QUERY_INVALID",
      );
    }
    expect(calls).toHaveLength(0);
  });
});

describe("strict response validation", () => {
  it("passes contract-valid responses through untouched", async () => {
    const fixture = dailyResponseFor(LOCATION_A);
    const { client } = recordingReadClient(fixture);
    const result = await loadReport(client, {
      kind: "DAILY",
      locationId: LOCATION_A,
      periodValue: "2026-01-30",
    });
    expect(result).toEqual(fixture);
  });

  it("rejects schema-drifted responses with honest diagnostic codes", async () => {
    for (const [payload, expectedCode] of [
      [{ unexpected: true }, "REPORTS_DAILY_RESPONSE_INVALID"],
      [
        // Periodic response missing the summary section.
        {
          kind: "WEEKLY",
          locationId: LOCATION_A,
          periodFrom: "2026-01-05",
          periodTo: "2026-01-11",
          timezone: "UTC",
        },
        "REPORTS_PERIODIC_RESPONSE_INVALID",
      ],
    ] as const) {
      const { client } = recordingReadClient(payload);
      const error = await caught(
        loadReport(client, {
          kind: expectedCode.startsWith("REPORTS_DAILY") ? "DAILY" : "WEEKLY",
          locationId: LOCATION_A,
          periodValue:
            expectedCode.startsWith("REPORTS_DAILY") ? "2026-01-30" : "2026-01-05",
        }),
      );
      expect(error).toBeInstanceOf(DashboardApiError);
      expect((error as DashboardApiError).code).toBe(expectedCode);
    }
  });
});

describe("export request building (discriminated union)", () => {
  it("builds the exact backend POST body per kind", () => {
    expect(buildReportExportRequest("DAILY", "CSV", "2026-01-30")).toEqual({
      date: "2026-01-30",
      format: "CSV",
      kind: "DAILY",
    });
    expect(buildReportExportRequest("WEEKLY", "PDF", "2026-01-05")).toEqual({
      format: "PDF",
      kind: "WEEKLY",
      weekStart: "2026-01-05",
    });
    expect(buildReportExportRequest("MONTHLY", "CSV", "2026-01")).toEqual({
      format: "CSV",
      kind: "MONTHLY",
      month: "2026-01",
    });
  });

  it("rejects invalid combinations before any traffic", () => {
    const error = (() => {
      try {
        buildReportExportRequest("MONTHLY", "CSV", "not-a-month");
        return null;
      } catch (caught_error) {
        return caught_error;
      }
    })();
    expect(error).toBeInstanceOf(DashboardApiError);
    expect((error as DashboardApiError).code).toBe(
      "REPORTS_EXPORT_REQUEST_INVALID",
    );
  });
});

describe("binary export content-type policing", () => {
  function binaryClient(result: {
    bytes: Uint8Array;
    contentDisposition: string | null;
    contentType: string | null;
  }): {
    calls: RecordedRequest[];
    client: Parameters<typeof exportReport>[0];
  } {
    const calls: RecordedRequest[] = [];
    const client = {
      async requestBinary(path: string, init?: Record<string, unknown>) {
        calls.push({ init, path });
        return result;
      },
    };
    return { calls, client: client as unknown as Parameters<typeof exportReport>[0] };
  }

  const REQUEST = buildReportExportRequest("DAILY", "CSV", "2026-01-30");

  it("POSTs the built request to the exports endpoint", async () => {
    const bytes = new Uint8Array([1]);
    const { calls, client } = binaryClient({
      bytes,
      contentDisposition: null,
      contentType: "text/csv; charset=utf-8",
    });
    const result = await exportReport(client, LOCATION_A, REQUEST);
    expect(calls[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_A}/reports/exports`,
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toEqual(REQUEST);
    expect(result.bytes).toBe(bytes);
  });

  it("accepts the exact family with or without parameters, rejects near-misses", async () => {
    const bytes = new Uint8Array([5]);
    for (const contentType of [
      "text/csv",
      "text/csv;charset=utf-8",
      "TEXT/CSV",
    ]) {
      const { client } = binaryClient({
        bytes,
        contentDisposition: null,
        contentType,
      });
      const result = await exportReport(client, LOCATION_A, REQUEST);
      expect(result.contentType).toBe(contentType.toLowerCase());
    }
    // Boundary precision: text/csvx is NOT the text/csv family.
    const nearMiss = binaryClient({
      bytes: new Uint8Array([6]),
      contentDisposition: null,
      contentType: "text/csvx",
    });
    const error = await caught(
      exportReport(nearMiss.client, LOCATION_A, REQUEST),
    );
    expect(error).toBeInstanceOf(DashboardApiError);
    expect((error as DashboardApiError).code).toBe(
      "REPORTS_EXPORT_RESPONSE_INVALID",
    );
  });

  it("returns PDF bytes family for a PDF request", async () => {
    const { client } = binaryClient({
      bytes: new Uint8Array([2]),
      contentDisposition: null,
      contentType: "application/pdf",
    });
    const result = await exportReport(
      client,
      LOCATION_A,
      buildReportExportRequest("DAILY", "PDF", "2026-01-30"),
    );
    expect(result.contentType).toBe("application/pdf");
  });

  it("rejects a mismatched artifact family instead of downloading it", async () => {
    // Server answers with JSON-family bytes for a CSV request: contract
    // drift must surface as an error, never become a file.
    for (const contentType of ["application/json", "text/html", null]) {
      const { client } = binaryClient({
        bytes: new Uint8Array([3]),
        contentDisposition: null,
        contentType,
      });
      const error = await caught(exportReport(client, LOCATION_A, REQUEST));
      expect(error).toBeInstanceOf(DashboardApiError);
      expect((error as DashboardApiError).code).toBe(
        "REPORTS_EXPORT_RESPONSE_INVALID",
      );
    }
  });
});
