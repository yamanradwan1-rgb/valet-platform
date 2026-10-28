import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("pool_startup_burst");
beforeAll(async () => {
  await context.setup();
  await context.runtimePool.end();
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl, {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "4",
    DATABASE_POOL_MAX_WAITERS: "128",
  });
}, 120_000);
afterAll(() => context.teardown(), 60_000);

describe("actual 4/128 admission bounds during an arrival burst", () => {
  it("rejects admission 133 before business SQL, then drains without leaking or timing out", async () => {
    const pool = context.runtimePool;
    const held = await Promise.all(
      Array.from({ length: 4 }, () => pool.connect()),
    );
    const queued = Array.from({ length: 128 }, () =>
      pool.connect().then((client) => client.release()),
    );
    const settled = Promise.allSettled(queued);
    try {
      await expect(pool.connect()).rejects.toMatchObject({
        reason: "QUEUE_FULL",
      });
      expect(runtimePoolSnapshot(pool)).toMatchObject({
        admitted: 132,
        peakAdmitted: 132,
        peakWaiting: 128,
        rejected: 1,
      });
    } finally {
      for (const client of held) client.release();
    }
    expect(
      (await settled).every((result) => result.status === "fulfilled"),
    ).toBe(true);
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      acquisitions: 132,
      rejected: 1,
      acquisitionTimeouts: 0,
      leased: 0,
      waiting: 0,
      active: 0,
    });
    // No business SQL was submitted; the rejected admission never reached PG.
    expect(runtimePoolSnapshot(pool).queryCounts?.[1]).toBe(0);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  }, 10_000);
});
