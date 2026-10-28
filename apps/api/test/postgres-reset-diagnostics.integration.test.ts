import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PoolClient } from "pg";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { withDatabaseDeadline } from "../src/common/database/runtime-database-deadline";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("reset_phase_diagnostics");
beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.runtimePool.end();
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl, {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "1",
    DATABASE_POOL_MAX_WAITERS: "2",
  });
});
afterAll(() => context.teardown(), 60_000);

async function drained() {
  await vi.waitFor(() =>
    expect(runtimePoolSnapshot(context.runtimePool)).toMatchObject({
      admitted: 0,
      leased: 0,
      acquiring: 0,
      waiting: 0,
      active: 0,
      activeByPhase: [0, 0, 0, 0, 0, 0, 0],
    }),
  );
}

function pause(client: PoolClient) {
  (
    client as unknown as { connection: { stream: { pause(): void } } }
  ).connection.stream.pause();
}

describe("real PG reset failures, disposal races and scoped cancellation", () => {
  it("classifies a real reset rejected by an aborted transaction and destroys exactly once", async () => {
    const pool = context.runtimePool;
    const client = await pool.connect();
    const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    await client.query("BEGIN");
    await expect(client.query("SELECT 1/0")).rejects.toMatchObject({
      code: "22012",
    });
    // Deliberately broken borrower: RESET really fails with 25P02 at PostgreSQL.
    client.release();
    client.release();
    await drained();
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      releaseFailures: 1,
      resetFailureReasons: [1, 0, 0, 0, 0, 0, 0, 0],
      resetFailuresAfterDisposal: 0,
      resetsInterrupted: 0,
      leaseCompletions: 1,
    });
    const next = await pool.connect();
    try {
      expect(
        (await next.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
      ).not.toBe(pid);
      expect(
        (await next.query("SHOW statement_timeout")).rows[0].statement_timeout,
      ).toBe("15s");
    } finally {
      next.release();
    }
    await drained();
    expect(runtimePoolSnapshot(pool).leaseCompletions).toBe(2);
  });

  it("keeps reset ownership until a genuinely lost response times out and recovers", async () => {
    const pool = context.runtimePool;
    const client = await pool.connect();
    const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    pause(client);
    client.release();
    try {
      await vi.waitFor(async () => {
        const result = await context.adminPool.query(
          "SELECT state, query LIKE 'RESET statement_timeout;%' AS resetting FROM pg_stat_activity WHERE pid=$1",
          [pid],
        );
        expect(result.rows[0]).toMatchObject({
          state: "idle",
          resetting: true,
        });
      });
      expect(runtimePoolSnapshot(pool).activeByPhase).toEqual([
        0, 0, 0, 0, 0, 0, 1,
      ]);
      await vi.waitFor(
        () => expect(runtimePoolSnapshot(pool).releaseFailures).toBe(1),
        { timeout: 3500 },
      );
      await drained();
      expect(runtimePoolSnapshot(pool)).toMatchObject({
        resetFailureReasons: [0, 1, 0, 0, 0, 0, 0, 0],
        queryTimeouts: 1,
        resetFailuresAfterDisposal: 1,
        resetsInterrupted: 1,
        leaseCompletions: 1,
      });
      expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
      await drained();
    } finally {
      client.release(true);
    }
  }, 7000);

  it("counts a reset interrupted by explicit disposal without releasing twice", async () => {
    const pool = context.runtimePool;
    const client = await pool.connect();
    pause(client);
    client.release();
    client.release(true);
    client.release(true);
    await vi.waitFor(() =>
      expect(runtimePoolSnapshot(pool).releaseFailures).toBe(1),
    );
    await drained();
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      resetsInterrupted: 1,
      resetFailuresAfterDisposal: 1,
      leaseCompletions: 1,
    });
    expect(
      runtimePoolSnapshot(pool).resetFailureReasons?.reduce(
        (sum, n) => sum + n,
        0,
      ),
    ).toBe(1);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
    await drained();
  });

  it("disposes a late acquisition after cancellation without executing application SQL", async () => {
    const pool = context.runtimePool;
    const held = await pool.connect();
    let executed = false;
    try {
      await expect(
        withDatabaseDeadline(50, async () => {
          const client = await pool.connect();
          try {
            executed = true;
            await client.query("SELECT 1");
          } finally {
            client.release();
          }
        }),
      ).rejects.toMatchObject({ reason: "OPERATION_DEADLINE" });
      expect(runtimePoolSnapshot(pool).waiting).toBe(1);
    } finally {
      held.release();
    }
    await drained();
    expect(executed).toBe(false);
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      expiredAcquisitions: 1,
      releaseFailures: 0,
    });
  });

  it("cancels an active transaction, rolls back its effect and recovers capacity", async () => {
    const pool = context.runtimePool;
    let actions = 0;
    let resume!: () => void;
    const suspended = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let settled: Promise<unknown> | undefined;
    const result = withDatabaseDeadline(1000, () => {
      const action = inPostgresTransaction(pool, async (client) => {
        actions += 1;
        await client.query(
          "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES ('v1:guest-token','anti-abuse-hmac-sha256:v1:'||repeat('b',64),'COUNTED')",
        );
        // Keep the transaction active without a competing query read timer.
        await suspended;
        await client.query("SELECT 1");
      });
      settled = action.catch((error: unknown) => error);
      return action;
    });
    try {
      await expect(result).rejects.toMatchObject({
        reason: "OPERATION_DEADLINE",
      });
    } finally {
      resume();
      await settled;
    }
    await drained();
    await vi.waitFor(async () =>
      expect(
        (
          await context.adminPool.query(
            "SELECT count(*)::int AS count FROM anti_abuse_events",
          )
        ).rows[0].count,
      ).toBe(0),
    );
    expect(actions).toBe(1);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
    await drained();
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      releaseFailures: 0,
      leaseCompletions: 2,
    });
  });
});
