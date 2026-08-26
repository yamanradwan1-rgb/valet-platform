import { describe, expect, it } from "vitest";

import type { FinancialOverviewResponse } from "@valet/contracts";

import {
  createFinancialOverviewLoader,
  type FinancialOverviewLoader,
} from "./financial-overview-loader";
import type { LatestRequestSnapshot } from "../../lib/api/latest-request-gate";

/**
 * Location-switch race coverage at the financial-feature level: a late
 * Location A response must never render as Location B data.
 */

const LOCATION_A = "11111111-1111-4111-8111-111111111111";
const LOCATION_B = "22222222-2222-4222-8222-222222222222";

function responseFor(currency: string): FinancialOverviewResponse {
  return {
    currencies: [
      {
        amountDueTotal: "10.000",
        amountPaidTotal: "10.000",
        collectionMethodCounts: [{ count: 1, method: "CASH" }],
        currency,
        currentValidationAmountTotal: "0.000",
        paymentCount: 1,
        statusCounts: [{ count: 1, status: "PAID" }],
        succeededRefundAmountTotal: "0.000",
        tipAmountTotal: "0.000",
      },
    ],
  };
}

type Deferred = {
  resolve: (value: FinancialOverviewResponse) => void;
  reject: (error: unknown) => void;
};

function harness(): {
  loader: FinancialOverviewLoader;
  snapshots: LatestRequestSnapshot<FinancialOverviewResponse>[];
  deferFor: (locationId: string) => Deferred;
} {
  const snapshots: LatestRequestSnapshot<FinancialOverviewResponse>[] = [];
  const pending = new Map<string, Deferred[]>();
  const loader = createFinancialOverviewLoader({
    client: {
      async request<T>(path: string): Promise<T> {
        const locationId = path.split("/")[3];
        return new Promise<T>((resolve, reject) => {
          const queue = pending.get(locationId ?? "") ?? [];
          const deferred: Deferred = {
            resolve: resolve as (value: FinancialOverviewResponse) => void,
            reject: reject as (error: unknown) => void,
          };
          queue.push(deferred);
          pending.set(locationId ?? "", queue);
        });
      },
    },
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  return {
    deferFor: (locationId: string): Deferred => {
      const deferred = pending.get(locationId)?.shift();
      if (deferred === undefined) throw new Error("no pending request");
      return deferred;
    },
    loader,
    snapshots,
  };
}

/** A macrotask boundary flushes every pending microtask deterministically. */
async function settle(): Promise<void> {
  await new Promise<void>((resolveTimer) => setTimeout(resolveTimer, 0));
}

describe("financial overview loader location race", () => {
  it("clears location A data synchronously when B is selected", () => {
    const { deferFor, loader, snapshots } = harness();
    loader.load(LOCATION_A);
    deferFor(LOCATION_A).resolve(responseFor("JOD"));
    return settle().then(() => {
      expect(snapshots.at(-1)?.phase).toBe("ready");
      loader.load(LOCATION_B);
      const latest = snapshots.at(-1);
      expect(latest?.phase).toBe("loading");
      // No JOD facts survive the switch while B is in flight.
      expect(
        latest?.data?.currencies.some((group) => group.currency === "JOD"),
      ).toBeFalsy();
    });
  });

  it("never applies a late Location A response after B loaded", async () => {
    const { deferFor, loader, snapshots } = harness();
    loader.load(LOCATION_A);
    await settle();
    loader.load(LOCATION_B);
    await settle();

    // Location A answers LATE, after B already owns the request identity.
    deferFor(LOCATION_A).resolve(responseFor("JOD"));
    await settle();
    expect(snapshots.every((snapshot) => snapshot.data === null)).toBe(true);

    deferFor(LOCATION_B).resolve(responseFor("USD"));
    await settle();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(
      snapshots
        .at(-1)
        ?.data?.currencies.map((group) => group.currency),
    ).toEqual(["USD"]);
    // No snapshot ever carried A's JOD group as data.
    expect(
      snapshots.some((snapshot) =>
        snapshot.data?.currencies.some((group) => group.currency === "JOD"),
      ),
    ).toBe(false);
  });

  it("retry re-requests the currently selected location only", async () => {
    const { deferFor, loader, snapshots } = harness();
    loader.load(LOCATION_A);
    await settle();
    deferFor(LOCATION_A).reject(new Error("network"));
    await settle();
    expect(snapshots.at(-1)?.phase).toBe("error");

    loader.retry();
    await settle();
    deferFor(LOCATION_A).resolve(responseFor("JOD"));
    await settle();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(snapshots.filter((snapshot) => snapshot.phase === "loading")).toHaveLength(2);
  });

  it("dispose stops applying any late response", async () => {
    const { deferFor, loader, snapshots } = harness();
    loader.load(LOCATION_A);
    await settle();
    loader.dispose();
    deferFor(LOCATION_A).resolve(responseFor("JOD"));
    await settle();
    expect(snapshots.every((snapshot) => snapshot.phase !== "ready")).toBe(true);
  });
});
