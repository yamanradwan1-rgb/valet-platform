import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createLiveMapQuery } from "../src/modules/tracking/live-map-query";
import { LiveMapTestContext } from "./live-map-test-context";

const context = new LiveMapTestContext("snapshot");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

function poolWithPostClockHook(hook: () => Promise<void>): PostgresPool {
  let pending = true;
  return {
    async connect() {
      const client = await context.runtimePool.connect();
      return {
        async query(text: string, values?: unknown[]) {
          const result = await client.query(text, values);
          if (
            pending &&
            text.includes("transaction_timestamp()::timestamptz(3)")
          ) {
            pending = false;
            await hook();
          }
          return result;
        },
        release: () => client.release(),
      } as unknown as PoolClient;
    },
  } as unknown as PostgresPool;
}

describe("VAL-007G coherent read snapshot", () => {
  it("returns pre-commit coherence during movement end, then post-commit omission", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const racingPool = poolWithPostClockHook(async () => {
      const mutation = await context.adminPool.connect();
      try {
        await mutation.query("BEGIN");
        await mutation.query(
          `UPDATE task_tracking_sessions
           SET ended_at = transaction_timestamp() WHERE id = $1`,
          [fixture.trackingSessionId],
        );
        await mutation.query(
          `UPDATE tasks SET status = 'COMPLETED', version = version + 1,
                  updated_at = transaction_timestamp() WHERE id = $1`,
          [fixture.movementTaskId],
        );
        await mutation.query(
          `UPDATE valet_sessions SET state = 'PARKED', version = version + 1,
                  updated_at = transaction_timestamp() WHERE id = $1`,
          [fixture.sessionId],
        );
        await mutation.query("COMMIT");
      } catch (error) {
        await mutation.query("ROLLBACK");
        throw error;
      } finally {
        mutation.release();
      }
    });

    const duringRace = await createLiveMapQuery(racingPool)({
      authenticatedUserId: manager.userId,
      limit: 100,
      locationId: fixture.locationId,
    });
    expect(duringRace.items).toHaveLength(1);
    expect(duringRace.items[0]).toMatchObject({
      sessionState: "PARKING",
      taskType: "PARKING",
      trackingSessionId: fixture.trackingSessionId,
    });

    const afterCommit = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(afterCommit.items).toEqual([]);
  });
});
