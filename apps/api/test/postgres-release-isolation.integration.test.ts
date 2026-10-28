import { AsyncResource } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { withDatabaseDeadline } from "../src/common/database/runtime-database-deadline";
import { withHttpDatabaseOperation } from "../src/common/observability/database-operation-context";
import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { createStaffOperationalContextQuery } from "../src/modules/staff/staff-operational-context-query";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("release_context_isolation");
beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.runtimePool.end();
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl, {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "4",
    DATABASE_POOL_MAX_WAITERS: "128",
  });
});
afterAll(() => context.teardown(), 60_000);
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function drained() {
  await vi.waitFor(() =>
    expect(runtimePoolSnapshot(context.runtimePool)).toMatchObject({
      admitted: 0,
      leased: 0,
      acquiring: 0,
      waiting: 0,
      active: 0,
    }),
  );
}

describe("real PG release context, configuration and concurrent tenant isolation", () => {
  it("resets committed session settings after release from an expired nested scope", async () => {
    const pool = context.runtimePool;
    const client = await pool.connect();
    await client.query("BEGIN");
    await client.query(`SELECT set_config('statement_timeout','700ms',false),
      set_config('lock_timeout','17ms',false),
      set_config('idle_in_transaction_session_timeout','900ms',false),
      set_config('transaction_timeout','1200ms',false)`);
    await client.query("COMMIT");
    const foreign = await withDatabaseDeadline(
      20,
      async () => new AsyncResource("expired-cleanup-caller"),
    );
    await wait(35);
    try {
      await withDatabaseDeadline(1000, () =>
        foreign.runInAsyncScope(async () => {
          await expect(client.query("SELECT 1")).rejects.toMatchObject({
            reason: "OPERATION_DEADLINE",
          });
          client.release();
        }),
      );
      await drained();
      expect(runtimePoolSnapshot(pool)).toMatchObject({
        releaseFailures: 0,
      });
      expect(runtimePoolSnapshot(pool).phaseCounts?.[6]).toBe(1);
      await withDatabaseDeadline(1000, async () => {
        const next = await pool.connect();
        try {
          expect(next).toBe(client);
          // Guest checkout intentionally skips general setup, exposing actual reset state.
          const settings =
            await next.query(`SELECT current_setting('statement_timeout') AS statement,
            current_setting('lock_timeout') AS lock,
            current_setting('idle_in_transaction_session_timeout') AS idle,
            current_setting('transaction_timeout') AS transaction`);
          expect(settings.rows[0]).toEqual({
            statement: "3s",
            lock: "2s",
            idle: "2s",
            transaction: "0",
          });
        } finally {
          next.release();
        }
      });
      await drained();
    } finally {
      foreign.emitDestroy();
      client.release(true);
    }
  });

  it("keeps four concurrent authorized tenants independent after a scoped socket expires", async () => {
    const actors = [];
    for (let index = 0; index < 4; index++) {
      const actor = await context.createFixture();
      const credential = generateStaffCredential("vsa1.");
      await context.adminPool.query(
        `INSERT INTO staff_auth_sessions
         (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,created_at,last_rotated_at)
         VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes',
           clock_timestamp()+interval '30 days',clock_timestamp(),clock_timestamp())`,
        [randomUUID(), actor.userId, staffCredentialHash("access", credential)],
      );
      actors.push({ ...actor, credential });
    }
    const pool = context.runtimePool;
    await withDatabaseDeadline(1000, () => pool.query("SELECT 1"));
    await wait(1025);
    const resolver = new DatabaseStaffSessionContextResolver(pool);
    await Promise.all(
      actors.map((actor) =>
        withHttpDatabaseOperation(
          "GET",
          "/v1/staff/operational-context",
          async () => {
            const principal = await resolver.resolve(
              `Bearer ${actor.credential}`,
            );
            expect(principal.userId).toBe(actor.userId);
            const result = await createStaffOperationalContextQuery(pool)(
              principal.userId,
            );
            expect(result.contexts).toHaveLength(1);
            expect(result.contexts[0]).toMatchObject({
              membershipId: actor.membershipId,
              organization: { organizationId: actor.organizationId },
            });
          },
        ),
      ),
    );
    await drained();
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      acquisitions: 9,
      leaseCompletions: 9,
      releaseFailures: 0,
      resetFailureReasons: [0, 0, 0, 0, 0, 0, 0, 0],
      operationLeases: [1, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0],
      acquisitionTimeouts: 0,
      rejected: 0,
      peakLeased: 4,
      total: 4,
      idle: 4,
    });
    await context.adminPool.query(
      "UPDATE users SET status='DISABLED' WHERE id=$1",
      [actors[0]!.userId],
    );
    await expect(
      resolver.resolve(`Bearer ${actors[0]!.credential}`),
    ).rejects.toMatchObject({ status: 401 });
    await drained();
    expect(runtimePoolSnapshot(pool).releaseFailures).toBe(0);
  });
});
