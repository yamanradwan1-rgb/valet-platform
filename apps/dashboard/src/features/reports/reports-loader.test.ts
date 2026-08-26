import { describe, expect, it } from "vitest";

import {
  dailyResponseFor,
  flush,
  harness,
  LOCATION_A,
  LOCATION_B,
  weeklyResponseFor,
} from "./reports-test-support";

/**
 * Race matrix for report READS (D4-002). Request identity is
 * (locationId, kind, periodValue); every new identity clears the snapshot
 * synchronously and late stale responses are dropped silently.
 */

describe("report read races", () => {
  it("location A → B: A's late response is ignored and B renders", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ locationId: LOCATION_A, kind: "DAILY", periodValue: "2026-01-05" });
    loader.load({ locationId: LOCATION_B, kind: "DAILY", periodValue: "2026-01-05" });

    const a = deferAll(LOCATION_A, "DAILY", "2026-01-05");
    const b = deferAll(LOCATION_B, "DAILY", "2026-01-05");
    b.resolve(dailyResponseFor(LOCATION_B));
    await flush();
    a.resolve(dailyResponseFor(LOCATION_A));
    await flush();

    const last = snapshots[snapshots.length - 1];
    if (last?.phase !== "ready") throw new Error("expected a ready snapshot");
    expect(last.data.locationId).toBe(LOCATION_B);
    // No ready snapshot ever carried A's data after the switch.
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.phase === "ready" &&
          snapshot.data.locationId === LOCATION_A,
      ),
    ).toBe(false);
  });

  it("kind switch DAILY → WEEKLY: stale DAILY response is ignored", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ locationId: LOCATION_A, kind: "DAILY", periodValue: "2026-01-05" });
    loader.load({ locationId: LOCATION_A, kind: "WEEKLY", periodValue: "2026-01-05" });

    const daily = deferAll(LOCATION_A, "DAILY", "2026-01-05");
    const weekly = deferAll(LOCATION_A, "WEEKLY", "2026-01-05");
    weekly.resolve(weeklyResponseFor(LOCATION_A));
    await flush();
    daily.resolve(dailyResponseFor(LOCATION_A));
    await flush();

    const last = snapshots[snapshots.length - 1];
    if (last?.phase !== "ready") throw new Error("expected a ready snapshot");
    expect(last.data.kind).toBe("WEEKLY");
  });

  it("period change P1 → P2: P1's response is ignored", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ locationId: LOCATION_A, kind: "DAILY", periodValue: "2026-01-05" });
    loader.load({ locationId: LOCATION_A, kind: "DAILY", periodValue: "2026-01-06" });

    const p1 = deferAll(LOCATION_A, "DAILY", "2026-01-05");
    const p2 = deferAll(LOCATION_A, "DAILY", "2026-01-06");
    p2.resolve({
      ...dailyResponseFor(LOCATION_A),
      periodFrom: "2026-01-06",
      periodTo: "2026-01-06",
    });
    await flush();
    p1.resolve(dailyResponseFor(LOCATION_A));
    await flush();

    const last = snapshots[snapshots.length - 1];
    if (last?.phase !== "ready") throw new Error("expected a ready snapshot");
    expect(last.data.locationId).toBe(LOCATION_A);
    // The rendered envelope is P2's, proven by the reported period.
    expect(last.data.kind === "DAILY" ? last.data.periodFrom : null).toBe(
      "2026-01-06",
    );
  });

  it("every identity change commits a clearing LOADING snapshot synchronously", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ locationId: LOCATION_A, kind: "DAILY", periodValue: "2026-01-05" });
    const first = deferAll(LOCATION_A, "DAILY", "2026-01-05");
    first.resolve(dailyResponseFor(LOCATION_A));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");

    loader.load({ locationId: LOCATION_B, kind: "DAILY", periodValue: "2026-01-05" });
    expect(snapshots.at(-1)).toEqual({ data: null, error: null, phase: "loading" });
  });
});
