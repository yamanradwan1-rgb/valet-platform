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
 * RETRY staleness coverage (review §10): a retry re-runs exactly the last
 * requested (location, period) identity, and stragglers of superseded
 * identities that answer after the retry must never mix into its state.
 */
describe("analytics loader retry staleness", () => {
  it("retry re-runs exactly the last requested identity", async () => {
    const { deferAll, loader, snapshots } = harness();
    // Hold back ONE straggler request of the first identity so it can answer
    // LATE — after the retry has already settled a newer identity.
    loader.load({ from: PERIOD_2, locationId: LOCATION_A, to: RANGE_END });
    await flush();
    deferAll(LOCATION_A, PERIOD_2, ["financial", "operations"]).resolve(
      compositionFor(LOCATION_A, "JOD"),
    );
    await flush();

    loader.load({ from: PERIOD_2, locationId: LOCATION_B, to: RANGE_END });
    await flush();
    deferAll(LOCATION_B, PERIOD_2).reject(new Error("network"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("error");

    loader.retry(); // re-runs B/P2 only
    await flush();
    deferAll(LOCATION_B, PERIOD_2).resolve(compositionFor(LOCATION_B, "USD"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(snapshots.at(-1)?.data?.financial.currencies[0]?.currency).toBe(
      "USD",
    );

    // The A/P2 straggler finally answers — retried state must NOT mix.
    deferAll(LOCATION_A, PERIOD_2).resolve(compositionFor(LOCATION_A, "JOD"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(snapshots.at(-1)?.data?.financial.currencies[0]?.currency).toBe(
      "USD",
    );
  });

  it("a period switch followed by failure and retry never revives the old period", async () => {
    const { deferAll, loader, snapshots } = harness();
    // A/P1 starts → user applies P2 → P2 fails → retry succeeds.
    loader.load({ from: PERIOD_1, locationId: LOCATION_A, to: RANGE_END });
    await flush();
    loader.load({ from: PERIOD_2, locationId: LOCATION_A, to: RANGE_END });
    await flush();

    // One P1 response arrives late while P2 is in flight (dropped), and one
    // P1 request stays pending until after everything else has settled.
    deferAll(LOCATION_A, PERIOD_1, ["financial", "incidents"]).resolve(
      compositionFor(LOCATION_A, "JOD"),
    );
    await flush();
    expect(snapshots.every((snapshot) => snapshot.data === null)).toBe(true);

    deferAll(LOCATION_A, PERIOD_2).reject(new Error("P2 failed"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("error");

    loader.retry(); // re-runs P2 only
    await flush();
    deferAll(LOCATION_A, PERIOD_2).resolve(compositionFor(LOCATION_A, "EUR"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(snapshots.at(-1)?.data?.financial.currencies[0]?.currency).toBe(
      "EUR",
    );

    // And the P1 straggler answers afterwards — nothing may change.
    deferAll(LOCATION_A, PERIOD_1).resolve(compositionFor(LOCATION_A, "JOD"));
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");
    expect(snapshots.at(-1)?.data?.financial.currencies[0]?.currency).toBe(
      "EUR",
    );
  });
});
