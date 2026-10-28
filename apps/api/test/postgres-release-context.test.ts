import { AsyncResource } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundPostgresPool,
  runtimePoolSnapshot,
} from "../src/common/database/bounded-postgres-pool";
import {
  isGuestDatabaseOperation,
  withDatabaseDeadline,
} from "../src/common/database/runtime-database-deadline";

const pools: Pool[] = [];
afterEach(async () => {
  for (const pool of pools.splice(0)) await pool.end();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  const query = vi.fn(async () => ({ rows: [{ ok: 1 }] }));
  const release = vi.fn();
  const client = Object.assign(new EventEmitter(), { query, release });
  const native = Object.assign(new EventEmitter(), {
    totalCount: 1,
    idleCount: 0,
    waitingCount: 0,
    connect: async () => {
      native.emit("connect", client);
      return client;
    },
    end: async () => {},
  });
  const pool = boundPostgresPool(native as unknown as Pool, 1, 128, {
    lockMs: 5000,
    statementMs: 15000,
    transactionMs: 30000,
    idleTransactionMs: 10000,
  });
  pools.push(pool);
  return { pool, query, release };
}

describe("lease release belongs to its acquisition context", () => {
  it.each([9, 10, 20])(
    "preserves cleanup across a foreign deadline at elapsed=%sms",
    async (elapsed) => {
      vi.useFakeTimers();
      let now = performance.now();
      vi.spyOn(performance, "now").mockImplementation(() => now);
      const { pool, query, release } = fixture();
      const client = await pool.connect();
      const socket = await withDatabaseDeadline(
        10,
        async () => new AsyncResource("foreign-socket"),
      );
      now += elapsed;
      socket.runInAsyncScope(() => {
        expect(isGuestDatabaseOperation()).toBe(true);
        client.release();
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(runtimePoolSnapshot(pool)).toMatchObject({
        releaseFailures: 0,
        admitted: 0,
        leaseCompletions: 1,
      });
      expect(query).toHaveBeenCalledTimes(2); // real wrapper submits setup and reset
      expect(release).toHaveBeenCalledExactlyOnceWith(undefined);
      socket.emitDestroy();
    },
  );

  it("does not let owner-bound cleanup authorize business SQL in an expired nested scope", async () => {
    vi.useFakeTimers();
    let now = performance.now();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { pool, query, release } = fixture();
    const client = await pool.connect();
    await withDatabaseDeadline(100, async () => {
      const child = await withDatabaseDeadline(
        10,
        async () => new AsyncResource("nested-child"),
      );
      now += 20;
      await child.runInAsyncScope(async () => {
        await expect(client.query("SELECT 1")).rejects.toMatchObject({
          reason: "OPERATION_DEADLINE",
        });
        client.release();
      });
      child.emitDestroy();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(query).toHaveBeenCalledTimes(2); // rejected work never reaches driver
    expect(release).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      releaseFailures: 0,
      admitted: 0,
    });
  });

  it("still destroys on reset rejection instead of recycling changed session state", async () => {
    const { pool, query, release } = fixture();
    const client = await pool.connect();
    query.mockRejectedValueOnce(
      Object.assign(new Error("controlled abort"), { code: "25P02" }),
    );
    client.release();
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      releaseFailures: 1,
      resetFailureReasons: [1, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("keeps guest cleanup and error disposal policies even under a different caller scope", async () => {
    const { pool, query, release } = fixture();
    const client = await withDatabaseDeadline(1000, () => pool.connect());
    // Guest ownership is retained; releasing outside its scope must not run general setup/reset.
    client.release(true);
    client.release();
    expect(query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
    expect(runtimePoolSnapshot(pool).leaseCompletions).toBe(1);
  });
});
