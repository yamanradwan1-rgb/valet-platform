import { describe, expect, it } from "vitest";

import { DashboardApiError, mapNetworkError } from "../../lib/api/api-error";
import {
  fetchFinancialOverview,
  fetchQueueSnapshot,
  fetchSessionStateCounts,
  loadOverviewComposition,
  type OverviewClient,
} from "./overview-api";

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";

// Paths supplied to StaffApiClient are RELATIVE to its `/v1/staff` base;
// see overview-url-resolution.test.ts for the resolved-URL proof.
const BASE = `/dashboard/locations/${LOCATION_ID}`;
const STATE_COUNTS_PATH = `${BASE}/overview/session-state-counts`;
const QUEUE_PATH = `${BASE}/analytics/queue`;
const FINANCIAL_PATH = `${BASE}/overview/financial`;

interface RecordedRequest {
  readonly path: string;
  readonly signal: AbortSignal | undefined;
}

function stubClient(
  handlers: Readonly<Record<string, () => unknown>>,
): { client: OverviewClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: OverviewClient = {
    async request<T>(path: string, options?: {
      signal?: AbortSignal;
    }): Promise<T> {
      requests.push({ path, signal: options?.signal });
      const handler = handlers[path];
      if (handler === undefined) {
        throw new Error(`Unexpected path: ${path}`);
      }
      return handler() as T;
    },
  };
  return { client, requests };
}

function stateCountsPayload(): {
  counts: Array<{ count: number; state: string }>;
} {
  return {
    counts: [
      { count: 2, state: "CHECKING_IN" },
      { count: 5, state: "AWAITING_PARKING" },
      { count: 3, state: "PARKING" },
      { count: 61, state: "PARKED" },
      { count: 3, state: "REQUESTED" },
      { count: 2, state: "RETRIEVING" },
      { count: 1, state: "READY" },
      { count: 1, state: "HANDOFF_PENDING" },
      { count: 118, state: "COMPLETED" },
    ],
  };
}

function currencyGroup(currency: string, paidTotal: string): unknown {
  return {
    amountDueTotal: "1260.000",
    amountPaidTotal: paidTotal,
    collectionMethodCounts: [{ count: 50, method: "CASH" }],
    currency,
    currentValidationAmountTotal: "30.000",
    paymentCount: 84,
    statusCounts: [{ count: 80, status: "PAID" }],
    succeededRefundAmountTotal: "12.000",
    tipAmountTotal: "87.500",
  };
}

describe("overview endpoint wiring", () => {
  it("requests exactly the three verified backend endpoints", async () => {
    const { client, requests } = stubClient({
      [FINANCIAL_PATH]: () => ({ currencies: [] }),
      [QUEUE_PATH]: () => ({ depth: 0, oldestAgeSeconds: null }),
      [STATE_COUNTS_PATH]: () => stateCountsPayload(),
    });
    await loadOverviewComposition(client, LOCATION_ID);
    expect(requests.map((request) => request.path).sort()).toEqual(
      [FINANCIAL_PATH, QUEUE_PATH, STATE_COUNTS_PATH].sort(),
    );
  });

  it("returns the parsed composition with all nine canonical states", async () => {
    const { client } = stubClient({
      [FINANCIAL_PATH]: () => ({ currencies: [] }),
      [QUEUE_PATH]: () => ({ depth: 3, oldestAgeSeconds: "486.000" }),
      [STATE_COUNTS_PATH]: () => stateCountsPayload(),
    });
    const composition = await loadOverviewComposition(client, LOCATION_ID);
    expect(composition.stateCounts.counts).toHaveLength(9);
    expect(
      composition.stateCounts.counts.some((c) => c.state === "COMPLETED"),
    ).toBe(true);
    expect(composition.queue.depth).toBe(3);
    expect(composition.queue.oldestAgeSeconds).toBe("486.000");
  });

  it("preserves exact money strings and keeps currencies separate", async () => {
    const { client } = stubClient({
      [FINANCIAL_PATH]: () => ({
        currencies: [
          currencyGroup("JOD", "1140.500"),
          currencyGroup("USD", "150.250"),
        ],
      }),
      [QUEUE_PATH]: () => ({ depth: 0, oldestAgeSeconds: null }),
      [STATE_COUNTS_PATH]: () => stateCountsPayload(),
    });
    const financial = await fetchFinancialOverview(client, LOCATION_ID);
    expect(financial.currencies).toHaveLength(2);
    expect(financial.currencies[0]?.currency).toBe("JOD");
    // Exact decimal strings survive transport + validation untouched.
    expect(financial.currencies[0]?.amountPaidTotal).toBe("1140.500");
    expect(financial.currencies[0]?.tipAmountTotal).toBe("87.500");
    expect(financial.currencies[1]?.amountPaidTotal).toBe("150.250");
    expect(financial.currencies.map((g) => g.currency)).toEqual([
      "JOD",
      "USD",
    ]);
  });

  it("accepts a null oldestAgeSeconds for an empty queue", async () => {
    const { client } = stubClient({
      [QUEUE_PATH]: () => ({ depth: 0, oldestAgeSeconds: null }),
    });
    const queue = await fetchQueueSnapshot(client, LOCATION_ID);
    expect(queue.oldestAgeSeconds).toBeNull();
    expect(queue.depth).toBe(0);
  });
});

describe("overview contract enforcement", () => {
  it("rejects state counts missing any canonical state (COMPLETED included)", async () => {
    const { client } = stubClient({
      [STATE_COUNTS_PATH]: () => ({
        counts: stateCountsPayload().counts.slice(0, 8),
      }),
    });
    await expect(fetchSessionStateCounts(client, LOCATION_ID)).rejects.toMatchObject(
      { code: "OVERVIEW_STATE_COUNTS_RESPONSE_INVALID" },
    );
  });

  it("rejects a queue snapshot whose age is not an exact string or null", async () => {
    const { client } = stubClient({
      [QUEUE_PATH]: () => ({ depth: 1, oldestAgeSeconds: 42 }),
    });
    await expect(
      fetchQueueSnapshot(client, LOCATION_ID),
    ).rejects.toBeInstanceOf(DashboardApiError);
  });

  it("rejects financial payloads that combine money into numbers", async () => {
    const group = currencyGroup("JOD", "1140.500") as Record<string, unknown>;
    const { client } = stubClient({
      [FINANCIAL_PATH]: () => ({
        currencies: [{ ...group, amountPaidTotal: 1140.5 }],
      }),
    });
    await expect(
      fetchFinancialOverview(client, LOCATION_ID),
    ).rejects.toMatchObject({ code: "OVERVIEW_FINANCIAL_RESPONSE_INVALID" });
  });
});

describe("single coherent failure model", () => {
  it("rejects the whole composition when one request fails", async () => {
    const failure = mapNetworkError();
    const { client } = stubClient({
      [FINANCIAL_PATH]: () => ({ currencies: [] }),
      [QUEUE_PATH]: (): never => {
        throw failure;
      },
      [STATE_COUNTS_PATH]: () => stateCountsPayload(),
    });
    await expect(loadOverviewComposition(client, LOCATION_ID)).rejects.toBe(
      failure,
    );
  });

  it("propagates transport failures unchanged", async () => {
    const { client } = stubClient({});
    await expect(
      fetchSessionStateCounts(client, LOCATION_ID),
    ).rejects.toThrow("Unexpected path");
  });

  it("forwards the abort signal to every request", async () => {
    const controller = new AbortController();
    const { client, requests } = stubClient({
      [FINANCIAL_PATH]: () => ({ currencies: [] }),
      [QUEUE_PATH]: () => ({ depth: 0, oldestAgeSeconds: null }),
      [STATE_COUNTS_PATH]: () => stateCountsPayload(),
    });
    await loadOverviewComposition(client, LOCATION_ID, controller.signal);
    for (const request of requests) {
      expect(request.signal).toBe(controller.signal);
    }
  });
});
