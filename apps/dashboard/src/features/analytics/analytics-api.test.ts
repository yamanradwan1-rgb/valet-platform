import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  analyticsLocationPath,
  analyticsPeriodQuery,
  fetchFinancialAnalytics,
  fetchIncidentAnalytics,
  fetchOperationalAnalytics,
  fetchQueueSnapshotForAnalytics,
  loadAnalyticsComposition,
  type AnalyticsClient,
} from "./analytics-api";

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const FROM = "2026-08-18";
const TO = "2026-08-24";
const BASE = `/dashboard/locations/${LOCATION_ID}/analytics`;

interface RecordedRequest {
  readonly path: string;
  readonly signal: AbortSignal | undefined;
}

function stubClient(
  handlers: Readonly<Record<string, () => unknown>>,
): { client: AnalyticsClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: AnalyticsClient = {
    async request<T>(
      path: string,
      options?: { signal?: AbortSignal },
    ): Promise<T> {
      requests.push({ path, signal: options?.signal });
      const handler = handlers[path];
      if (handler === undefined) throw new Error(`Unexpected path: ${path}`);
      return handler() as T;
    },
  };
  return { client, requests };
}

function envelope(): Record<string, unknown> {
  return {
    from: FROM,
    locationId: LOCATION_ID,
    timezone: "Asia/Amman",
    to: TO,
  };
}

function operationsPayload(): Record<string, unknown> {
  return {
    ...envelope(),
    carsHandledPerDay: [{ date: "2026-08-18", handledCount: 14 }],
    metrics: {
      checkInTime: { averageSeconds: "17.542", sampleCount: 118 },
      handoffTime: { averageSeconds: null, sampleCount: 104 },
      parkingTime: { averageSeconds: "183.217", sampleCount: 115 },
      retrievalStartLatencyAuxiliary: {
        averageSeconds: "71.845",
        sampleCount: 110,
      },
      retrievalWait: { averageSeconds: "421.306", sampleCount: 108 },
    },
  };
}

function financialGroup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    collectedAmountTotal: "1140.000",
    currency: "JOD",
    currentValidationAmountTotal: "210.000",
    digitalPaymentRate: { denominator: 80, numerator: 52, percentage: "65.00" },
    paidPaymentCount: 70,
    succeededRefundAmountTotal: "45.000",
    tipAmountTotal: "87.500",
    validationRate: { denominator: 78, numerator: 36, percentage: null },
    ...overrides,
  };
}

function financialPayload(): Record<string, unknown> {
  return {
    ...envelope(),
    cashReconciliation: [
      {
        cashExpectedTotal: "395.000",
        cashReportedTotal: "390.000",
        cashVarianceTotal: "-5.000",
        currency: "JOD",
      },
    ],
    currencies: [financialGroup()],
  };
}

function incidentsPayload(): Record<string, unknown> {
  return {
    ...envelope(),
    incidentCount: 4,
    incidentsPer1000: { denominator: 118, numerator: 4, value: "33.898" },
    severityCounts: [
      { count: 1, severity: "LOW" },
      { count: 2, severity: "MEDIUM" },
      { count: 1, severity: "HIGH" },
      { count: 0, severity: "CRITICAL" },
    ],
    typeCounts: [{ count: 2, type: "CUSTOMER_COMPLAINT" }],
  };
}

function fullHandlers(): Record<string, () => unknown> {
  return {
    [`${BASE}/financial${analyticsPeriodQuery(FROM, TO)}`]: financialPayload,
    [`${BASE}/incidents${analyticsPeriodQuery(FROM, TO)}`]: incidentsPayload,
    [`${BASE}/operations${analyticsPeriodQuery(FROM, TO)}`]: operationsPayload,
    [`${BASE}/queue`]: () => ({ depth: 3, oldestAgeSeconds: "486.000" }),
  };
}

describe("analytics endpoint wiring", () => {
  it("requests the four verified endpoints with exact period query params", async () => {
    const { client, requests } = stubClient(fullHandlers());
    await loadAnalyticsComposition(client, LOCATION_ID, FROM, TO);
    expect(requests.map((request) => request.path).sort()).toEqual(
      Object.keys(fullHandlers()).sort(),
    );
    // Every period endpoint sends exactly from then to; queue sends none.
    for (const request of requests) {
      if (request.path.includes("/queue")) {
        expect(request.path.endsWith(`${BASE}/queue`)).toBe(true);
      } else {
        expect(request.path.endsWith(`?from=${FROM}&to=${TO}`)).toBe(true);
      }
    }
  });

  it("calls the queue snapshot without any period parameters", async () => {
    const { client, requests } = stubClient({
      [`${BASE}/queue`]: () => ({ depth: 0, oldestAgeSeconds: null }),
    });
    await fetchQueueSnapshotForAnalytics(client, LOCATION_ID);
    expect(requests[0]?.path).toBe(`${BASE}/queue`);
  });

  it("encodes the location id in client-relative paths", () => {
    expect(analyticsLocationPath("x y", "queue")).toBe(
      "/dashboard/locations/x%20y/analytics/queue",
    );
    expect(analyticsPeriodQuery("2026-01-01", "2026-01-31")).toBe(
      "?from=2026-01-01&to=2026-01-31",
    );
  });

  it("forwards the abort signal to every request", async () => {
    const controller = new AbortController();
    const { client, requests } = stubClient(fullHandlers());
    await loadAnalyticsComposition(
      client,
      LOCATION_ID,
      FROM,
      TO,
      controller.signal,
    );
    for (const request of requests) {
      expect(request.signal).toBe(controller.signal);
    }
  });
});

describe("analytics contract enforcement (strict parsing)", () => {
  it.each([
    ["operations", fetchOperationalAnalytics],
    ["financial", fetchFinancialAnalytics],
    ["incidents", fetchIncidentAnalytics],
  ] as const)(
    "%s rejects an out-of-contract envelope date format",
    async (_name, fetcher) => {
      const payload = (() => {
        switch (fetcher) {
          case fetchOperationalAnalytics:
            return operationsPayload();
          case fetchFinancialAnalytics:
            return financialPayload();
          default:
            return incidentsPayload();
        }
      })() as Record<string, unknown>;
      const bad = { ...payload, from: "08/18/2026" };
      const { client } = stubClient({
        [`${BASE}/${_name}${analyticsPeriodQuery(FROM, TO)}`]: () => bad,
      });
      await expect(
        fetcher(client, LOCATION_ID, FROM, TO),
      ).rejects.toMatchObject({ code: `ANALYTICS_${_name.toUpperCase()}_RESPONSE_INVALID` });
    },
  );

  it("rejects money totals that arrive as numbers", async () => {
    const { client } = stubClient({
      [`${BASE}/financial${analyticsPeriodQuery(FROM, TO)}`]: () => ({
        ...financialPayload(),
        currencies: [financialGroup({ collectedAmountTotal: 1140 })],
      }),
    });
    await expect(
      fetchFinancialAnalytics(client, LOCATION_ID, FROM, TO),
    ).rejects.toMatchObject({
      code: "ANALYTICS_FINANCIAL_RESPONSE_INVALID",
    });
  });

  it("rejects backend rates whose percentage is not a string or null", async () => {
    const { client } = stubClient({
      [`${BASE}/financial${analyticsPeriodQuery(FROM, TO)}`]: () => ({
        ...financialPayload(),
        currencies: [
          financialGroup({
            digitalPaymentRate: { denominator: 80, numerator: 52, percentage: 65 },
          }),
        ],
      }),
    });
    await expect(
      fetchFinancialAnalytics(client, LOCATION_ID, FROM, TO),
    ).rejects.toBeInstanceOf(DashboardApiError);
  });

  it("rejects queue snapshots with a numeric oldestAgeSeconds", async () => {
    const { client } = stubClient({
      [`${BASE}/queue`]: () => ({ depth: 1, oldestAgeSeconds: 486 }),
    });
    await expect(
      fetchQueueSnapshotForAnalytics(client, LOCATION_ID),
    ).rejects.toMatchObject({ code: "ANALYTICS_QUEUE_RESPONSE_INVALID" });
  });

  it("preserves exact money strings including signed cash variance and null rate honesty", async () => {
    const { client } = stubClient({
      [`${BASE}/financial${analyticsPeriodQuery(FROM, TO)}`]: financialPayload,
    });
    const financial = await fetchFinancialAnalytics(
      client,
      LOCATION_ID,
      FROM,
      TO,
    );
    expect(financial.cashReconciliation[0]?.cashVarianceTotal).toBe("-5.000");
    expect(financial.currencies[0]?.collectedAmountTotal).toBe("1140.000");
    expect(financial.currencies[0]?.digitalPaymentRate.percentage).toBe(
      "65.00",
    );
    expect(financial.currencies[0]?.validationRate.percentage).toBeNull();
  });

  it("keeps multiple currency groups separate in backend order", async () => {
    const { client } = stubClient({
      [`${BASE}/financial${analyticsPeriodQuery(FROM, TO)}`]: () => ({
        ...financialPayload(),
        currencies: [
          financialGroup(),
          financialGroup({ currency: "USD", collectedAmountTotal: "40.250" }),
        ],
      }),
    });
    const financial = await fetchFinancialAnalytics(
      client,
      LOCATION_ID,
      FROM,
      TO,
    );
    expect(financial.currencies.map((group) => group.currency)).toEqual([
      "JOD",
      "USD",
    ]);
    expect(financial.cashReconciliation).toHaveLength(1);
    expect(financial.cashReconciliation[0]?.currency).toBe("JOD");
  });
});
