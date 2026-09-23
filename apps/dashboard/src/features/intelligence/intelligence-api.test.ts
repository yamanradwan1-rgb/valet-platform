import { describe, expect, it, vi } from "vitest";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  readCompanyAnalytics,
  readCompanyDailyReport,
  readCompanyMonthlyReport,
  readCompanyWeeklyReport,
  readLocationDailyReport,
  readLocationFinancialAnalytics,
  readLocationFinancialOverview,
  readLocationIncidentAnalytics,
  readLocationKpiAnalytics,
  readLocationMonthlyReport,
  readLocationOperationalAnalytics,
  readLocationQueueAnalytics,
  readLocationSessionStateCounts,
  readLocationWeeklyReport,
} from "./intelligence-api";

const locationId = "location / alpha";
const organizationId = "organization / beta";
const encodedLocationId = "location%20%2F%20alpha";
const encodedOrganizationId = "organization%20%2F%20beta";
const period = { from: "2026-09-01", to: "2026-09-23" };

function mockApi() {
  const request = vi.fn().mockResolvedValue({});
  return { api: { request } as unknown as DashboardApiClient, request };
}

function responseApi(payload: unknown) {
  return new DashboardApiClient({
    auth: {
      getAccessToken: () => "token",
      getIdentityGeneration: () => 1,
      getSessionGeneration: () => 1,
      isTokenFresh: () => true,
      refresh: vi.fn(),
    },
    fetch: vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    ),
  });
}

const locationReport = (kind: "WEEKLY" | "MONTHLY") => ({
  kind,
  locationId: "11111111-1111-4111-8111-111111111111",
  timezone: "UTC",
  periodFrom: "2026-09-01",
  periodTo: "2026-09-30",
  summary: {
    metrics: Object.fromEntries(
      ["checkInTime", "parkingTime", "retrievalWait", "retrievalStartLatencyAuxiliary", "handoffTime"].map(
        (name) => [name, { sampleCount: 0, averageSeconds: null }],
      ),
    ),
    carsHandledPerDay: [],
    currencies: [],
    cashReconciliation: [],
    incidents: {
      incidentCount: 0,
      severityCounts: [],
      typeCounts: [],
      incidentsPer1000: { numerator: 0, denominator: 0, value: null },
    },
  },
});

const companyReport = (kind: "WEEKLY" | "MONTHLY") => ({
  kind,
  organizationId: "22222222-2222-4222-8222-222222222222",
  periodFrom: "2026-09-01",
  periodTo: "2026-09-30",
  summary: {
    coverage: {
      totalLocationCount: 0,
      activeLocationCount: 0,
      inactiveLocationCount: 0,
      timezoneBoundaries: [],
    },
    operational: {
      metrics: Object.fromEntries(
        ["checkInTime", "parkingTime", "retrievalWait", "retrievalStartLatencyAuxiliary", "handoffTime"].map(
          (name) => [name, { sampleCount: 0, averageSeconds: null, contributingLocationCount: 0 }],
        ),
      ),
      carsHandledPerDay: [],
    },
    financial: { currencies: [], cashReconciliation: [] },
    incidents: {
      incidentCount: 0,
      severityCounts: [],
      typeCounts: [],
      incidentsPer1000: { numerator: 0, denominator: 0, value: null },
    },
    kpis: {
      slaCompliance: {
        numerator: 0,
        denominator: 0,
        percentage: null,
        missingTargetCount: 0,
        invalidOrMissingIntervalCount: 0,
        contributingLocationCount: 0,
        requestCount: 0,
      },
      carsPerActiveEmployee: {
        numerator: 0,
        denominator: 0,
        value: null,
        evidenceLocationCount: 0,
      },
      carsHandedOff: {
        attributedCount: 0,
        missingAttributionCount: 0,
        distinctAttributedEmployeeCount: 0,
      },
      keyExceptions: {
        count: 0,
        byType: [
          { type: "KEY_MISSING", count: 0 },
          { type: "WRONG_KEY", count: 0 },
          { type: "KEY_DAMAGED", count: 0 },
          { type: "KEY_LOCKED_INSIDE", count: 0 },
        ],
      },
    },
  },
});

describe("MD-05 intelligence JSON adapters", () => {
  it.each([
    [readLocationSessionStateCounts, "/overview/session-state-counts"],
    [readLocationQueueAnalytics, "/analytics/queue"],
    [readLocationFinancialOverview, "/overview/financial"],
  ] as const)("uses the exact current Location path %s", async (read, suffix) => {
    const { api, request } = mockApi();
    await read(api, locationId);
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/dashboard/locations/${encodedLocationId}${suffix}`,
    );
    expect(request.mock.calls[0]?.[2]).toEqual({ signal: undefined });
  });

  it.each([
    [readLocationOperationalAnalytics, "/analytics/operations"],
    [readLocationFinancialAnalytics, "/analytics/financial"],
    [readLocationIncidentAnalytics, "/analytics/incidents"],
    [readLocationKpiAnalytics, "/analytics/kpis"],
  ] as const)("uses the exact Location period path %s", async (read, suffix) => {
    const { api, request } = mockApi();
    await read(api, locationId, period);
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/dashboard/locations/${encodedLocationId}${suffix}`,
    );
    expect(request.mock.calls[0]?.[2]?.query).toEqual(period);
  });

  it("uses the authoritative Company all-locations path", async () => {
    const { api, request } = mockApi();
    await readCompanyAnalytics(api, organizationId, period);
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/management/organizations/${encodedOrganizationId}/analytics/all-locations`,
    );
    expect(request.mock.calls[0]?.[2]?.query).toEqual(period);
  });

  it.each([
    [readLocationDailyReport, "/reports/daily", { date: "2026-09-23" }],
    [readLocationWeeklyReport, "/reports/weekly", { weekStart: "2026-09-21" }],
    [readLocationMonthlyReport, "/reports/monthly", { month: "2026-09" }],
  ] as const)("uses the exact Location report path and selector %s", async (read, suffix, selector) => {
    const { api, request } = mockApi();
    await read(api, locationId, selector as never);
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/dashboard/locations/${encodedLocationId}${suffix}`,
    );
    expect(request.mock.calls[0]?.[2]?.query).toEqual(selector);
  });

  it.each([
    [readCompanyDailyReport, "/reports/daily", { date: "2026-09-23" }],
    [readCompanyWeeklyReport, "/reports/weekly", { weekStart: "2026-09-21" }],
    [readCompanyMonthlyReport, "/reports/monthly", { month: "2026-09" }],
  ] as const)("uses the exact Company report path and selector %s", async (read, suffix, selector) => {
    const { api, request } = mockApi();
    await read(api, organizationId, selector as never);
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/management/organizations/${encodedOrganizationId}${suffix}`,
    );
    expect(request.mock.calls[0]?.[2]?.query).toEqual(selector);
  });

  it("rejects non-canonical period and report selectors before transport", () => {
    const { api, request } = mockApi();
    expect(() =>
      readLocationOperationalAnalytics(api, locationId, {
        from: "09/01/2026",
        to: "2026-09-23",
      }),
    ).toThrow();
    expect(() =>
      readCompanyDailyReport(api, organizationId, { date: "23-09-2026" }),
    ).toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("surfaces a schema-invalid successful response as malformed", async () => {
    const api = responseApi({ counts: [] });
    await expect(readLocationSessionStateCounts(api, locationId)).rejects.toMatchObject({
      kind: "malformed",
    });
  });

  it.each([
    [readLocationWeeklyReport, { weekStart: "2026-09-21" }, locationReport("MONTHLY")],
    [readLocationMonthlyReport, { month: "2026-09" }, locationReport("WEEKLY")],
    [readCompanyWeeklyReport, { weekStart: "2026-09-21" }, companyReport("MONTHLY")],
    [readCompanyMonthlyReport, { month: "2026-09" }, companyReport("WEEKLY")],
  ] as const)("rejects a mismatched periodic report kind as malformed", async (read, selector, payload) => {
    await expect(read(responseApi(payload), "scope-id", selector as never)).rejects.toMatchObject({
      kind: "malformed",
    });
  });
});
