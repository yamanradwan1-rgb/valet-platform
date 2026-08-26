import { afterAll, describe, expect, it, vi } from "vitest";

import {
  fetchFinancialAnalytics,
  fetchIncidentAnalytics,
  fetchOperationalAnalytics,
  fetchQueueSnapshotForAnalytics,
} from "../../features/analytics/analytics-api";
import {
  fetchLocationFinancialOverview,
} from "../../features/financial-overview/financial-overview-api";
import { StaffApiClient } from "./staff-api-client";

/**
 * INTEGRATION-LEVEL URL RESOLUTION PROOF (D4-001 pre-commit review §2).
 *
 * A mock that merely records strings passed into client.request() is NOT
 * sufficient proof. This suite drives the REAL StaffApiClient — its own
 * baseUrl handling and template-literal construction inside
 * staff-api-client.ts — with ONLY the network boundary (globalThis.fetch)
 * replaced by a recorder, through the REAL production API modules, and pins
 * the FINAL browser request URL of every D4-001 endpoint, proving there is
 * no double `/v1/staff` prefix.
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const FROM = "2026-08-18";
const TO = "2026-08-24";
/** Exactly what api-config.getStaffApiBaseUrl() returns in the browser. */
const BROWSER_BASE = "/v1/staff";
const FINAL_BASE = `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}`;

const ENVELOPE = {
  from: FROM,
  locationId: LOCATION_ID,
  timezone: "Asia/Amman",
  to: TO,
};

const PERIOD_QUERY = `?from=${FROM}&to=${TO}`;

/** Contract-valid minimal payloads keyed by FINAL request URL. */
const VALID_PAYLOADS: Record<string, unknown> = {
  [`${FINAL_BASE}/overview/financial`]: { currencies: [] },
  [`${FINAL_BASE}/analytics/operations${PERIOD_QUERY}`]: {
    ...ENVELOPE,
    carsHandledPerDay: [],
    metrics: {
      checkInTime: { averageSeconds: null, sampleCount: 0 },
      handoffTime: { averageSeconds: null, sampleCount: 0 },
      parkingTime: { averageSeconds: null, sampleCount: 0 },
      retrievalStartLatencyAuxiliary: { averageSeconds: null, sampleCount: 0 },
      retrievalWait: { averageSeconds: null, sampleCount: 0 },
    },
  },
  [`${FINAL_BASE}/analytics/financial${PERIOD_QUERY}`]: {
    ...ENVELOPE,
    cashReconciliation: [],
    currencies: [],
  },
  [`${FINAL_BASE}/analytics/incidents${PERIOD_QUERY}`]: {
    ...ENVELOPE,
    incidentCount: 0,
    incidentsPer1000: { denominator: 0, numerator: 0, value: null },
    severityCounts: [],
    typeCounts: [],
  },
  [`${FINAL_BASE}/analytics/queue`]: { depth: 0, oldestAgeSeconds: null },
};

const EXPECTED_URLS = Object.keys(VALID_PAYLOADS).sort();

function stubFetch(): { requestedUrls: string[] } {
  const requestedUrls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requestedUrls.push(rawUrl);
      const parsed = new URL(rawUrl, "http://localhost");
      const body = VALID_PAYLOADS[`${parsed.pathname}${parsed.search}`];
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body ?? {}),
      } as unknown as Response;
    }),
  );
  return { requestedUrls };
}

function realClient(): StaffApiClient {
  return new StaffApiClient({
    baseUrl: BROWSER_BASE,
    getAccessToken: () => "test-token",
    recoverFromUnauthorized: async () => null,
  });
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("D4-001 final request URL resolution (real StaffApiClient)", () => {
  it("resolves all five endpoints to exactly one /v1/staff prefix", async () => {
    const { requestedUrls } = stubFetch();
    const client = realClient();

    await fetchLocationFinancialOverview(client, LOCATION_ID);
    await fetchOperationalAnalytics(client, LOCATION_ID, FROM, TO);
    await fetchFinancialAnalytics(client, LOCATION_ID, FROM, TO);
    await fetchIncidentAnalytics(client, LOCATION_ID, FROM, TO);
    await fetchQueueSnapshotForAnalytics(client, LOCATION_ID);

    expect(requestedUrls.sort()).toEqual(EXPECTED_URLS);
    for (const url of requestedUrls) {
      expect(url.startsWith("/v1/staff/v1/staff/")).toBe(false);
      expect(url.startsWith("/v1/staff/dashboard/locations/")).toBe(true);
    }
  });

  it("keeps the queue snapshot free of any period parameters", async () => {
    const { requestedUrls } = stubFetch();
    await fetchQueueSnapshotForAnalytics(realClient(), LOCATION_ID);
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toBe(`${FINAL_BASE}/analytics/queue`);
    expect(requestedUrls[0]?.includes("?")).toBe(false);
  });

  it("preserves the /v1/staff prefix through the real Next.js proxy rule", async () => {
    const config = await import("../../../next.config");
    const rules = (await config.default.rewrites?.()) ?? [];
    const staffRule = Array.isArray(rules)
      ? rules.find((rule) => rule.source === "/v1/staff/:path*")
      : undefined;
    expect(staffRule).toBeDefined();
    // The destination re-attaches the SAME prefix on the API origin, so the
    // backend receives /v1/staff/dashboard/... exactly once.
    expect(staffRule?.destination.endsWith("/v1/staff/:path*")).toBe(true);
  });
});
