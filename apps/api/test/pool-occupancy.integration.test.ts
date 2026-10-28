import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { verifyRuntimeDatabaseReadiness } from "../src/common/database/runtime-database-readiness";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { ShiftTestContext } from "./shift-test-context";

describe("real PostgreSQL occupancy measurement and isolated admission", () => {
  const context = new ShiftTestContext("pool_occupancy");
  let pool: PostgresPool;
  let independent: PostgresPool;
  beforeAll(async () => {
    await context.setup();
    await context.runtimePool.end();
    const settings = {
      NODE_ENV: "test",
      DATABASE_POOL_MAX: "1",
      DATABASE_POOL_MAX_WAITERS: "1",
    };
    pool = createRuntimePostgresPool(context.runtimeUrl, settings);
    context.runtimePool = pool;
    independent = createRuntimePostgresPool(context.runtimeUrl, settings);
  }, 120_000);
  afterAll(async () => {
    await independent?.end();
    await context.teardown();
  }, 60_000);

  it("rejects at max plus waiters, keeps a separate worker-like pool healthy and recovers", async () => {
    const held = await pool.connect();
    const pending = pool.connect();
    await Promise.all([
      expect(verifyRuntimeDatabaseReadiness(pool)).rejects.toMatchObject({
        reason: "QUEUE_FULL",
      }),
      expect(independent.query("SELECT 1 AS ok")).resolves.toMatchObject({
        rows: [{ ok: 1 }],
      }),
    ]);
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      peakAdmitted: 2,
      peakWaiting: 1,
      admitted: 2,
      rejected: 1,
    });
    held.release();
    const next = await pending;
    next.release();
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    await expect(verifyRuntimeDatabaseReadiness(pool)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    expect(pool.waitingCount).toBe(0);
    expect(pool.totalCount).toBe(1);
    expect(runtimePoolSnapshot(independent).rejected).toBe(0);
  });

  it("measures setup, work, transaction control, reset and lease completion exactly once", async () => {
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    const before = runtimePoolSnapshot(pool);
    // Snapshot arrays are live counters; copy before starting the operation.
    const counts = [...before.queryCounts!];
    const times = [...before.queryMs!];
    const buckets = [...before.leaseBuckets!];
    await inPostgresTransaction(pool, async (client) => {
      await client.query("SELECT 1");
      await new Promise<void>((resolve, reject) =>
        client.query("SELECT 2", (error) =>
          error ? reject(error) : resolve(),
        ),
      );
    });
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    const after = runtimePoolSnapshot(pool);
    expect(
      after.queryCounts!.map((count, index) => count - counts[index]!),
    ).toEqual([1, 2, 2, 1]);
    expect(after.queryMs!.every((ms, index) => ms > times[index]!)).toBe(true);
    expect(after.acquisitions! - before.acquisitions!).toBe(1);
    expect(
      after.nativeAcquisitionAttempts! - before.nativeAcquisitionAttempts!,
    ).toBe(1);
    expect(after.leaseCompletions! - before.leaseCompletions!).toBe(1);
    expect(
      after.leaseBuckets!.reduce(
        (sum, count, index) => sum + count - buckets[index]!,
        0,
      ),
    ).toBe(1);
    expect(after.leaseMs! - before.leaseMs!).toBeGreaterThan(0);
    expect(
      after.nativeAcquisitionMs! - before.nativeAcquisitionMs!,
    ).toBeGreaterThanOrEqual(0);
  });
});
