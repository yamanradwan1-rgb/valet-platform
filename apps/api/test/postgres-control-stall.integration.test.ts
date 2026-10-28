import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { withHttpDatabaseOperation } from "../src/common/observability/database-operation-context";
import {
  readRuntimeMetrics,
  formatRuntimeMetrics,
} from "../src/common/observability/runtime-metrics-pulse";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("control_stall_diagnostics");
beforeAll(async () => {
  await context.setup();
  await context.runtimePool.end();
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl, {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "4",
    DATABASE_POOL_MAX_WAITERS: "128",
    DATABASE_GENERAL_LOCK_MS: "10000",
  });
  // Deliberate test-only deferred COMMIT lock. This is not the historical cause.
  await context.adminPool.query(`
    CREATE TABLE public.diagnostic_commit_probe (value integer);
    CREATE FUNCTION public.diagnostic_commit_fence() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      PERFORM pg_advisory_xact_lock_shared(783442, 1); RETURN NULL;
    END $$;
    CREATE CONSTRAINT TRIGGER diagnostic_commit_fence
    AFTER INSERT ON public.diagnostic_commit_probe
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION public.diagnostic_commit_fence();
    GRANT INSERT ON public.diagnostic_commit_probe TO "${context.runtimeRole}";
  `);
}, 120_000);
afterAll(() => context.teardown(), 60_000);

describe("real PG four-client COMMIT stall attribution (controlled fault, not capacity)", () => {
  it("identifies in-flight control ownership, native acquisition timeouts and complete recovery", async () => {
    const pool = context.runtimePool;
    const holder = await context.adminPool.connect();
    const clients: PoolClient[] = [];
    let work: Promise<PromiseSettledResult<void>[]> | undefined;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(783442, 1)");
      const pending = Array.from({ length: 4 }, (_, index) =>
        withHttpDatabaseOperation(
          "GET",
          index === 3
            ? "/v1/staff/valet-sessions/directory?secret=never-retained"
            : "/v1/staff/tasks/queue?secret=never-retained",
          () =>
            inPostgresTransaction(pool, async (client) => {
              clients.push(client);
              await client.query(
                "INSERT INTO diagnostic_commit_probe VALUES (1)",
              );
            }),
        ),
      );
      work = Promise.allSettled(pending);
      await vi.waitFor(
        async () => {
          const result = await context.adminPool.query(
            `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE usename=$1 AND query='COMMIT' AND wait_event_type='Lock'`,
            [context.runtimeRole],
          );
          expect(result.rows[0].count).toBe(4);
        },
        { timeout: 3000 },
      );
      expect(runtimePoolSnapshot(pool)).toMatchObject({
        activeByPhase: [0, 0, 0, 0, 4, 0, 0],
        activeByOperation: [0, 0, 0, 3, 1, 0, 0, 0, 0, 0, 0],
        peakActive: 4,
        peakLeased: 4,
      });
      await withHttpDatabaseOperation(
        "GET",
        "/v1/staff/operational-context",
        () =>
          expect(pool.connect()).rejects.toMatchObject({
            reason: "ACQUISITION_TIMEOUT",
          }),
      );
      await vi.waitFor(
        () => {
          const during = runtimePoolSnapshot(pool);
          expect(during.oldestQueryByPhaseMs?.[4]).toBeGreaterThan(5000);
          expect(during.oldestLeaseByPhaseMs?.[4]).toBeGreaterThan(5000);
        },
        { timeout: 4000, interval: 50 },
      );
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
      if (work)
        expect((await work).every((r) => r.status === "fulfilled")).toBe(true);
      for (const client of clients) client.release();
    }
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    const after = runtimePoolSnapshot(pool);
    expect(after).toMatchObject({
      acquisitions: 4,
      leaseCompletions: 4,
      acquisitionTimeouts: 1,
      rejected: 0,
      releaseFailures: 0,
      waiting: 0,
      leased: 0,
      active: 0,
      acquiring: 0,
      activeByPhase: [0, 0, 0, 0, 0, 0, 0],
      operationAcquisitionTimeouts: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(after.phaseCounts).toEqual([0, 4, 4, 4, 4, 0, 4]);
    expect(after.phaseMs?.[4]).toBeGreaterThan(20000);
    expect(after.phaseMaxMs?.[4]).toBeGreaterThan(5000);
    expect(after.operationLeaseMaxMs?.[3]).toBeGreaterThan(5000);
    expect(after.operationLeaseMaxMs?.[4]).toBeGreaterThan(5000);
    const metric = readRuntimeMetrics(pool);
    expect(metric.pid).toBe(process.pid);
    expect(metric.sampledAtMs - metric.processStartedAtMs).toBeGreaterThan(0);
    expect(formatRuntimeMetrics(metric)).not.toMatch(
      /never-retained|diagnostic_commit|SELECT|INSERT/,
    );
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM diagnostic_commit_probe",
        )
      ).rows[0].count,
    ).toBe(4);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  }, 15_000);
});
