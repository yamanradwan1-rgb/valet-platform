import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  fetchLocationFinancialOverview,
  financialOverviewPath,
  type FinancialOverviewClient,
} from "./financial-overview-api";

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const EXPECTED_PATH = `/dashboard/locations/${LOCATION_ID}/overview/financial`;

interface RecordedRequest {
  readonly path: string;
  readonly signal: AbortSignal | undefined;
}

function stubClient(
  payload: unknown | (() => unknown),
): { client: FinancialOverviewClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: FinancialOverviewClient = {
    async request<T>(
      path: string,
      options?: { signal?: AbortSignal },
    ): Promise<T> {
      requests.push({ path, signal: options?.signal });
      return (typeof payload === "function" ? payload() : payload) as T;
    },
  };
  return { client, requests };
}

/** Full valid currency group with deliberately zero-padded money strings. */
function currencyGroup(overrides: Record<string, unknown> = {}): unknown {
  return {
    amountDueTotal: "1260.000",
    amountPaidTotal: "1140.500",
    collectionMethodCounts: [
      { count: 4, method: "NONE" },
      { count: 28, method: "CASH" },
      { count: 52, method: "DIGITAL" },
    ],
    currency: "JOD",
    currentValidationAmountTotal: "210.000",
    paymentCount: 84,
    statusCounts: [
      { count: 4, status: "NOT_REQUIRED" },
      { count: 6, status: "UNPAID" },
      { count: 2, status: "PENDING" },
      { count: 70, status: "PAID" },
      { count: 2, status: "FAILED" },
    ],
    succeededRefundAmountTotal: "45.000",
    tipAmountTotal: "87.500",
    ...overrides,
  };
}

describe("financial overview endpoint wiring", () => {
  it("requests exactly the verified backend endpoint path", async () => {
    const { client, requests } = stubClient({ currencies: [] });
    await fetchLocationFinancialOverview(client, LOCATION_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(EXPECTED_PATH);
  });

  it("encodes the location id into the client-relative path", () => {
    expect(financialOverviewPath("abc")).toBe(
      "/dashboard/locations/abc/overview/financial",
    );
  });

  it("forwards the abort signal", async () => {
    const { client, requests } = stubClient({ currencies: [] });
    const controller = new AbortController();
    await fetchLocationFinancialOverview(client, LOCATION_ID, controller.signal);
    expect(requests[0]?.signal).toBe(controller.signal);
  });
});

describe("financial overview contract enforcement", () => {
  it("preserves exact decimal strings character for character", async () => {
    const { client } = stubClient({
      currencies: [currencyGroup()],
    });
    const financial = await fetchLocationFinancialOverview(client, LOCATION_ID);
    const group = financial.currencies[0];
    expect(group?.amountDueTotal).toBe("1260.000");
    expect(group?.amountPaidTotal).toBe("1140.500");
    expect(group?.tipAmountTotal).toBe("87.500");
    expect(group?.succeededRefundAmountTotal).toBe("45.000");
    expect(group?.currentValidationAmountTotal).toBe("210.000");
  });

  it("keeps multiple currency groups separate in backend order", async () => {
    const { client } = stubClient({
      currencies: [
        currencyGroup(),
        currencyGroup({
          currency: "USD",
          amountDueTotal: "40.000",
          amountPaidTotal: "40.250",
        }),
        currencyGroup({
          currency: "EUR",
          tipAmountTotal: "0.010",
        }),
      ],
    });
    const financial = await fetchLocationFinancialOverview(client, LOCATION_ID);
    expect(financial.currencies.map((group) => group.currency)).toEqual([
      "JOD",
      "USD",
      "EUR",
    ]);
    expect(financial.currencies[1]?.amountPaidTotal).toBe("40.250");
    expect(financial.currencies[2]?.tipAmountTotal).toBe("0.010");
  });

  it("rejects money fields that arrive as numbers", async () => {
    const { client } = stubClient({
      currencies: [currencyGroup({ amountPaidTotal: 1140.5 })],
    });
    await expect(
      fetchLocationFinancialOverview(client, LOCATION_ID),
    ).rejects.toMatchObject({
      code: "FINANCIAL_OVERVIEW_RESPONSE_INVALID",
    });
  });

  it("rejects payloads with unexpected extra fields (strict schema)", async () => {
    const group = currencyGroup() as Record<string, unknown>;
    const { client } = stubClient({
      currencies: [{ ...group, averageTicketTotal: "99.999" }],
    });
    await expect(
      fetchLocationFinancialOverview(client, LOCATION_ID),
    ).rejects.toBeInstanceOf(DashboardApiError);
  });

  it("rejects a group missing an authoritative field", async () => {
    const group = currencyGroup() as Record<string, unknown>;
    delete group.currentValidationAmountTotal;
    const { client } = stubClient({ currencies: [group] });
    await expect(
      fetchLocationFinancialOverview(client, LOCATION_ID),
    ).rejects.toMatchObject({
      code: "FINANCIAL_OVERVIEW_RESPONSE_INVALID",
    });
  });

  it("rejects unsupported payment statuses instead of rendering them", async () => {
    const { client } = stubClient({
      currencies: [
        currencyGroup({
          statusCounts: [{ count: 1, status: "REFUNDED" }],
        }),
      ],
    });
    await expect(
      fetchLocationFinancialOverview(client, LOCATION_ID),
    ).rejects.toBeInstanceOf(DashboardApiError);
  });

  it("accepts an honest empty currency list", async () => {
    const { client } = stubClient({ currencies: [] });
    const financial = await fetchLocationFinancialOverview(client, LOCATION_ID);
    expect(financial.currencies).toEqual([]);
  });

  it("treats an all-zero currency group as DATA, not absence", async () => {
    // A valid metric set full of zeros must parse and survive untouched so
    // the view can render zeros instead of an empty-state illustration.
    const { client } = stubClient({
      currencies: [
        currencyGroup({
          amountDueTotal: "0.000",
          amountPaidTotal: "0.000",
          collectionMethodCounts: [{ count: 0, method: "NONE" }],
          currentValidationAmountTotal: "0.000",
          paymentCount: 0,
          statusCounts: [{ count: 0, status: "NOT_REQUIRED" }],
          succeededRefundAmountTotal: "0.000",
          tipAmountTotal: "0.000",
        }),
      ],
    });
    const financial = await fetchLocationFinancialOverview(client, LOCATION_ID);
    expect(financial.currencies).toHaveLength(1);
    expect(financial.currencies[0]?.amountPaidTotal).toBe("0.000");
    expect(financial.currencies[0]?.paymentCount).toBe(0);
  });
});
