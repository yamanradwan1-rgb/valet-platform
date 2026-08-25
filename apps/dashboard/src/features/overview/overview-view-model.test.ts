import { describe, expect, it } from "vitest";

import type {
  FinancialOverviewResponse,
  QueueSnapshotResponse,
  SessionStateCountsResponse,
} from "@valet/contracts";

import {
  deriveVehiclesInService,
  financialCurrencyGroups,
  formatOldestAgeSeconds,
  hasCurrentVehicleActivity,
  hasFinancialCurrencies,
  isOldestWaitElevated,
} from "./overview-view-model";

/**
 * Canonical backend order for the nine accepted session states, matching
 * apps/api overview-sessions-query.ts. COMPLETED stays valid here: the
 * Sessions-page exclusion rule does NOT apply to Overview state counts.
 */
function canonicalCounts(): SessionStateCountsResponse["counts"] {
  return [
    { count: 2, state: "CHECKING_IN" },
    { count: 5, state: "AWAITING_PARKING" },
    { count: 3, state: "PARKING" },
    { count: 61, state: "PARKED" },
    { count: 3, state: "REQUESTED" },
    { count: 2, state: "RETRIEVING" },
    { count: 1, state: "READY" },
    { count: 1, state: "HANDOFF_PENDING" },
    { count: 118, state: "COMPLETED" },
  ];
}

describe("deriveVehiclesInService", () => {
  it("sums authoritative state counts excluding COMPLETED", () => {
    // 2+5+3+61+3+2+1+1 = 78 (COMPLETED 118 excluded)
    expect(deriveVehiclesInService(canonicalCounts())).toBe(78);
  });

  it("keeps COMPLETED represented in the input counts untouched", () => {
    const counts = canonicalCounts();
    const completedEntry = counts.find((entry) => entry.state === "COMPLETED");
    expect(completedEntry).toEqual({ count: 118, state: "COMPLETED" });
    expect(counts).toHaveLength(9);
  });

  it("returns 0 for all-zero counts", () => {
    const zeroCounts = canonicalCounts().map((entry) => ({
      ...entry,
      count: 0,
    }));
    expect(deriveVehiclesInService(zeroCounts)).toBe(0);
  });
});

describe("formatOldestAgeSeconds", () => {
  const units = { minutes: "m", seconds: "s" };

  it("renders null as the localized unavailable label", () => {
    expect(formatOldestAgeSeconds(null, "—", units)).toBe("—");
  });

  it("floors fractional server-clock seconds into m/s display", () => {
    expect(formatOldestAgeSeconds("486.000", "—", units)).toBe("8m 6s");
    expect(formatOldestAgeSeconds("75.500", "—", units)).toBe("1m 15s");
    expect(formatOldestAgeSeconds("59.999", "—", units)).toBe("59s");
    expect(formatOldestAgeSeconds("0.000", "—", units)).toBe("0s");
  });

  it("supports localized unit suffixes without changing the value", () => {
    expect(
      formatOldestAgeSeconds("486.000", "—", { minutes: "د", seconds: "ث" }),
    ).toBe("8د 6ث");
  });

  it("falls back to the unavailable label for unusable values", () => {
    expect(formatOldestAgeSeconds("-5.000", "—", units)).toBe("—");
    expect(formatOldestAgeSeconds("not-a-number", "—", units)).toBe("—");
  });
});

describe("isOldestWaitElevated", () => {
  it("flags waits above the display threshold only", () => {
    expect(isOldestWaitElevated("300.000")).toBe(false);
    expect(isOldestWaitElevated("300.001")).toBe(true);
    expect(isOldestWaitElevated("486.000")).toBe(true);
  });

  it("never flags a null age", () => {
    expect(isOldestWaitElevated(null)).toBe(false);
  });
});

describe("hasCurrentVehicleActivity", () => {
  it("is false when every vehicle is COMPLETED and the queue is empty", () => {
    const onlyCompleted = canonicalCounts().map((entry) => ({
      ...entry,
      count: entry.state === "COMPLETED" ? 7 : 0,
    }));
    expect(hasCurrentVehicleActivity(onlyCompleted, 0)).toBe(false);
  });

  it("is true for any non-COMPLETED vehicle or queued retrieval", () => {
    const zeroed = canonicalCounts().map((entry) => ({ ...entry, count: 0 }));
    expect(hasCurrentVehicleActivity(zeroed, 0)).toBe(false);
    expect(
      hasCurrentVehicleActivity(
        zeroed.map((entry) =>
          entry.state === "PARKED" ? { ...entry, count: 1 } : entry,
        ),
        0,
      ),
    ).toBe(true);
    expect(hasCurrentVehicleActivity(zeroed, 2)).toBe(true);
  });
});

describe("financial currency groups", () => {
  const financial: FinancialOverviewResponse = {
    currencies: [
      {
        amountDueTotal: "1260.000",
        amountPaidTotal: "1140.000",
        collectionMethodCounts: [],
        currency: "JOD",
        currentValidationAmountTotal: "30.000",
        paymentCount: 84,
        statusCounts: [],
        succeededRefundAmountTotal: "12.000",
        tipAmountTotal: "87.500",
      },
      {
        amountDueTotal: "200.000",
        amountPaidTotal: "150.000",
        collectionMethodCounts: [],
        currency: "USD",
        currentValidationAmountTotal: "0.000",
        paymentCount: 10,
        statusCounts: [],
        succeededRefundAmountTotal: "0.000",
        tipAmountTotal: "5.250",
      },
    ],
  };

  it("passes groups through with exact decimal strings preserved", () => {
    const groups = financialCurrencyGroups(financial);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.amountPaidTotal).toBe("1140.000");
    expect(groups[0]?.tipAmountTotal).toBe("87.500");
    expect(groups[1]?.amountDueTotal).toBe("200.000");
  });

  it("keeps multiple currencies strictly separate", () => {
    const groups = financialCurrencyGroups(financial);
    expect(groups.map((group) => group.currency)).toEqual(["JOD", "USD"]);
  });

  it("reports an empty financial surface honestly", () => {
    const empty: FinancialOverviewResponse = { currencies: [] };
    expect(hasFinancialCurrencies(empty)).toBe(false);
    expect(hasFinancialCurrencies(financial)).toBe(true);
  });
});

describe("queue snapshot typing", () => {
  it("treats oldestAgeSeconds as string | null, never a number", () => {
    const snapshot: QueueSnapshotResponse = {
      depth: 3,
      oldestAgeSeconds: "486.000",
    };
    expect(typeof snapshot.oldestAgeSeconds).toBe("string");
    const emptyQueue: QueueSnapshotResponse = {
      depth: 0,
      oldestAgeSeconds: null,
    };
    expect(emptyQueue.oldestAgeSeconds).toBeNull();
  });
});
