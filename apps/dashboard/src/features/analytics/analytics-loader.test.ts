import { describe, expect, it } from "vitest";

import {
  compositionFor,
  flush,
  harness,
  LOCATION_A,
  LOCATION_B,
  PERIOD_1,
  PERIOD_2,
  RANGE_END,
} from "./analytics-loader-test-support";

/**
 * Location AND period switch race coverage at the analytics-feature level:
 * the loader identity is (locationId, from, to), so a late Location A /
 * old-period response can never surface under B / new-period.
 */
describe("analytics loader identity-switch race safety", () => {
  it("rejects late Location A responses after Location B loaded", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ from: PERIOD_1, locationId: LOCATION_A, to: RANGE_END });
    await flush();
    loader.load({ from: PERIOD_1, locationId: LOCATION_B, to: RANGE_END });
    await flush();

    // Location A answers LATE, after B owns the request identity.
    deferAll(LOCATION_A, PERIOD_1).resolve(compositionFor(LOCATION_A, "JOD"));
    await flush();
    expect(snapshots.every((snapshot) => snapshot.data === null)).toBe(true);

    deferAll(LOCATION_B, PERIOD_1).resolve(compositionFor(LOCATION_B, "USD"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(snapshots.at(-1)?.data?.financial.currencies[0]?.currency).toBe(
      "USD",
    );
    expect(
      snapshots.some((snapshot) =>
        snapshot.data?.financial.currencies.some(
          (group) => group.currency === "JOD",
        ),
      ),
    ).toBe(false);
  });

  it("rejects a late old-period response for the same location", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ from: PERIOD_1, locationId: LOCATION_A, to: RANGE_END });
    await flush();
    loader.load({ from: PERIOD_2, locationId: LOCATION_A, to: RANGE_END });
    await flush();

    deferAll(LOCATION_A, PERIOD_1).resolve(compositionFor(LOCATION_A, "JOD"));
    await flush();
    expect(snapshots.every((snapshot) => snapshot.data === null)).toBe(true);

    deferAll(LOCATION_A, PERIOD_2).resolve(compositionFor(LOCATION_A, "EUR"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(snapshots.at(-1)?.data?.financial.currencies[0]?.currency).toBe(
      "EUR",
    );
  });

  it("clears ready data synchronously on any identity change", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ from: PERIOD_1, locationId: LOCATION_A, to: RANGE_END });
    await flush();
    deferAll(LOCATION_A, PERIOD_1).resolve(compositionFor(LOCATION_A, "JOD"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");

    loader.load({ from: PERIOD_1, locationId: LOCATION_B, to: RANGE_END });
    expect(snapshots.at(-1)).toEqual({
      phase: "loading",
      data: null,
      error: null,
    });
  });

  it("a superseded identity's rejection never surfaces as an error state", async () => {
    const { deferAll, loader, snapshots } = harness();
    loader.load({ from: PERIOD_1, locationId: LOCATION_A, to: RANGE_END });
    await flush();
    loader.load({ from: PERIOD_2, locationId: LOCATION_A, to: RANGE_END });
    await flush();

    deferAll(LOCATION_A, PERIOD_1).reject(new Error("late failure"));
    await flush();
    expect(
      snapshots.every((snapshot) => snapshot.phase !== "error"),
    ).toBe(true);

    deferAll(LOCATION_A, PERIOD_2).resolve(compositionFor(LOCATION_A, "EUR"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");
  });
});
