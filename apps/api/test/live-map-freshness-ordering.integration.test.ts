import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createLiveMapQuery } from "../src/modules/tracking/live-map-query";
import type { TrackingFixture } from "./gps-ingestion-test-context";
import { LiveMapTestContext } from "./live-map-test-context";

const context = new LiveMapTestContext("freshness_ordering");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

function poolWithDatabaseObservedOffset(
  fixture: TrackingFixture,
  offsetMilliseconds: number,
): PostgresPool {
  return {
    async connect() {
      const client = await context.runtimePool.connect();
      return {
        async query(text: string, values?: unknown[]) {
          if (text.includes("transaction_timestamp()::timestamptz(3)")) {
            return client.query(
              `SELECT captured_at + ($2::integer * interval '1 millisecond')
                        AS "observedAt"
               FROM raw_gps_samples
               WHERE tracking_session_id = $1
               ORDER BY captured_at DESC, id DESC LIMIT 1`,
              [fixture.trackingSessionId, offsetMilliseconds],
            );
          }
          return client.query(text, values);
        },
        release: () => client.release(),
      } as unknown as PoolClient;
    },
  } as unknown as PostgresPool;
}

async function queryAtSampleOffset(
  fixture: TrackingFixture,
  authenticatedUserId: string,
  offsetMilliseconds: number,
) {
  return createLiveMapQuery(
    poolWithDatabaseObservedOffset(fixture, offsetMilliseconds),
  )({
    authenticatedUserId,
    limit: 100,
    locationId: fixture.locationId,
  });
}

describe("VAL-007G database-controlled freshness and latest ordering", () => {
  it.each([
    { expected: "LIVE", observedOffset: 60_000 },
    { expected: "STALE", observedOffset: 60_001 },
  ] as const)(
    "classifies a sample $observedOffset ms old as $expected",
    async ({ expected, observedOffset }) => {
      const fixture = await context.createParkingTrackingFixture();
      const manager = await context.manager(fixture);
      await context.seedSampleWithDatabaseOffset(fixture, {
        offsetMilliseconds: 0,
      });

      const result = await queryAtSampleOffset(
        fixture,
        manager.userId,
        observedOffset,
      );
      const position = result.items[0]!.position!;
      expect(position.freshness).toBe(expected);
      expect(
        Date.parse(result.observedAt) - Date.parse(position.capturedAt),
      ).toBe(observedOffset);
    },
  );

  it("keeps an accepted-style sample 30 seconds in the future LIVE", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    await context.seedSampleWithDatabaseOffset(fixture, {
      offsetMilliseconds: 0,
    });

    const result = await queryAtSampleOffset(fixture, manager.userId, -30_000);
    const position = result.items[0]!.position!;
    expect(position.freshness).toBe("LIVE");
    expect(
      Date.parse(position.capturedAt) - Date.parse(result.observedAt),
    ).toBe(30_000);
  });

  it("keeps canonical newer N after older backfill B is inserted later", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const newer = await context.seedSampleWithDatabaseOffset(fixture, {
      latitude: 31.1,
      offsetMilliseconds: 0,
    });
    const backfill = await context.seedSampleWithDatabaseOffset(fixture, {
      latitude: 31.2,
      offsetMilliseconds: -240_000,
    });
    expect(newer.capturedAt.getTime()).toBeGreaterThan(
      backfill.capturedAt.getTime(),
    );

    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(result.items[0]!.position).toMatchObject({
      capturedAt: newer.capturedAt.toISOString(),
      latitude: 31.1,
    });
  });
});
