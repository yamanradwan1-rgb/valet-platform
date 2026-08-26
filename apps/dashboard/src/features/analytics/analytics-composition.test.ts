import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  fetchOperationalAnalytics,
  loadAnalyticsComposition,
  type AnalyticsClient,
} from "./analytics-api";

/**
 * Composition-level behavior of the Analytics transport: all four requests
 * form ONE coherent page state — the first failure rejects the whole load,
 * and a contract-invalid period query never leaves the client.
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const FROM = "2026-08-18";
const TO = "2026-08-24";
const BASE = `/dashboard/locations/${LOCATION_ID}/analytics`;

function stubClient(
  handlers: Readonly<Record<string, () => unknown>>,
): { client: AnalyticsClient; requests: { path: string }[] } {
  const requests: { path: string }[] = [];
  const client: AnalyticsClient = {
    async request<T>(path: string): Promise<T> {
      requests.push({ path });
      const handler = handlers[path];
      if (handler === undefined) throw new Error(`Unexpected path: ${path}`);
      return handler() as T;
    },
  };
  return { client, requests };
}

describe("analytics composition failure model", () => {
  it("rejects the whole composition when one endpoint fails", async () => {
    const failure = new DashboardApiError({
      kind: "server",
      status: 500,
      code: "REQUEST_FAILED",
      message: "boom",
    });
    const failingPath = `${BASE}/incidents?from=${FROM}&to=${TO}`;
    const { client } = stubClient({
      [`${BASE}/financial?from=${FROM}&to=${TO}`]: () => ({
        cashReconciliation: [],
        currencies: [],
        from: FROM,
        locationId: LOCATION_ID,
        timezone: "Asia/Amman",
        to: TO,
      }),
      [failingPath]: () => {
        throw failure;
      },
      [`${BASE}/operations?from=${FROM}&to=${TO}`]: () => ({
        carsHandledPerDay: [],
        from: FROM,
        locationId: LOCATION_ID,
        metrics: {
          checkInTime: { averageSeconds: null, sampleCount: 0 },
          handoffTime: { averageSeconds: null, sampleCount: 0 },
          parkingTime: { averageSeconds: null, sampleCount: 0 },
          retrievalStartLatencyAuxiliary: {
            averageSeconds: null,
            sampleCount: 0,
          },
          retrievalWait: { averageSeconds: null, sampleCount: 0 },
        },
        timezone: "Asia/Amman",
        to: TO,
      }),
      [`${BASE}/queue`]: () => ({ depth: 0, oldestAgeSeconds: null }),
    });
    await expect(
      loadAnalyticsComposition(client, LOCATION_ID, FROM, TO),
    ).rejects.toBe(failure);
  });

  it("never sends a contract-invalid period query", async () => {
    const { client, requests } = stubClient({});
    await expect(
      fetchOperationalAnalytics(client, LOCATION_ID, "2026-9-1", "2026-09-30"),
    ).rejects.toMatchObject({ code: "ANALYTICS_PERIOD_QUERY_INVALID" });
    expect(requests).toHaveLength(0);
  });

  it("treats an all-zero analytics metric set as DATA, not absence", async () => {
    // Zeros are authoritative facts; the transport must deliver them intact
    // so sections render zero cards instead of fabricating empty states.
    const { client } = stubClient({
      [`${BASE}/operations?from=${FROM}&to=${TO}`]: () => ({
        carsHandledPerDay: [{ date: FROM, handledCount: 0 }],
        from: FROM,
        locationId: LOCATION_ID,
        metrics: {
          checkInTime: { averageSeconds: null, sampleCount: 0 },
          handoffTime: { averageSeconds: null, sampleCount: 0 },
          parkingTime: { averageSeconds: null, sampleCount: 0 },
          retrievalStartLatencyAuxiliary: {
            averageSeconds: null,
            sampleCount: 0,
          },
          retrievalWait: { averageSeconds: null, sampleCount: 0 },
        },
        timezone: "Asia/Amman",
        to: TO,
      }),
      [`${BASE}/financial?from=${FROM}&to=${TO}`]: () => ({
        cashReconciliation: [],
        currencies: [
          {
            collectedAmountTotal: "0.000",
            currency: "JOD",
            currentValidationAmountTotal: "0.000",
            digitalPaymentRate: {
              denominator: 0,
              numerator: 0,
              percentage: null,
            },
            paidPaymentCount: 0,
            succeededRefundAmountTotal: "0.000",
            tipAmountTotal: "0.000",
            validationRate: { denominator: 0, numerator: 0, percentage: null },
          },
        ],
        from: FROM,
        locationId: LOCATION_ID,
        timezone: "Asia/Amman",
        to: TO,
      }),
      [`${BASE}/incidents?from=${FROM}&to=${TO}`]: () => ({
        from: FROM,
        incidentCount: 0,
        incidentsPer1000: { denominator: 0, numerator: 0, value: null },
        locationId: LOCATION_ID,
        severityCounts: [{ count: 0, severity: "LOW" }],
        timezone: "Asia/Amman",
        to: TO,
        typeCounts: [],
      }),
      [`${BASE}/queue`]: () => ({ depth: 0, oldestAgeSeconds: null }),
    });

    const composition = await loadAnalyticsComposition(
      client,
      LOCATION_ID,
      FROM,
      TO,
    );
    expect(composition.operations.carsHandledPerDay[0]?.handledCount).toBe(0);
    expect(composition.financial.currencies[0]?.collectedAmountTotal).toBe(
      "0.000",
    );
    expect(composition.financial.currencies[0]?.digitalPaymentRate.percentage)
      .toBeNull();
    expect(composition.incidents.incidentCount).toBe(0);
    expect(composition.queue.depth).toBe(0);
  });
});
