import { performance } from "node:perf_hooks";
import { Logger } from "@nestjs/common";
import { RuntimeDatabaseLifecycle } from "../src/common/database/runtime-database.module";
import { RuntimeDatabaseUnavailableError } from "../src/common/database/runtime-database-deadline";
import { EventEmitter } from "node:events";
import type { Pool, PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundPostgresPool,
  runtimePoolSnapshot,
} from "../src/common/database/bounded-postgres-pool";
import { withDatabaseDeadline } from "../src/common/database/runtime-database-deadline";

const budgets = {
  lockMs: 100,
  statementMs: 200,
  transactionMs: 1000,
  idleTransactionMs: 100,
};
function fixture() {
  const pending: Array<{
    resolve(client: PoolClient): void;
    reject(error: Error): void;
  }> = [];
  const native = Object.assign(new EventEmitter(), {
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    connect: () =>
      new Promise<PoolClient>((resolve, reject) =>
        pending.push({ resolve, reject }),
      ),
    end: async () => {},
  });
  const pool = boundPostgresPool(native as unknown as Pool, 1, 1, budgets);
  const makeClient = () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [] }));
    const client = Object.assign(new EventEmitter(), { query, release });
    native.emit("connect", client);
    return { client: client as unknown as PoolClient, release, query };
  };
  return { pool, pending, makeClient };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("pool diagnostic counters and admission lifecycle", () => {
  it("counts failed initialization without exposing driver details or changing the error", async () => {
    const { pool } = fixture();
    const failure = new RuntimeDatabaseUnavailableError("CONNECT_ERROR");
    Object.assign(pool, { query: vi.fn().mockRejectedValue(failure) });
    const log = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    await expect(
      new RuntimeDatabaseLifecycle(pool).onApplicationBootstrap(),
    ).rejects.toBe(failure);
    expect(runtimePoolSnapshot(pool).initializationFailures).toBe(1);
    expect(log).toHaveBeenCalledWith(
      "DATABASE_INITIALIZATION_FAILED reason=CONNECT_ERROR",
    );
    await pool.end();
  });

  it("bounds admission, reports timeout separately, and recovers after release", async () => {
    const { pool, pending, makeClient } = fixture();
    const first = pool.connect();
    const second = pool.connect().catch((error: unknown) => error);
    await expect(pool.connect()).rejects.toMatchObject({
      reason: "QUEUE_FULL",
    });
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      configuredMax: 1,
      queueCapacity: 1,
      admitted: 2,
      rejected: 1,
    });
    const borrowed = makeClient();
    pending[0]!.resolve(borrowed.client);
    const client = await first;
    pending[1]!.reject(new Error("timeout exceeded when trying to connect"));
    expect(await second).toMatchObject({ reason: "ACQUISITION_TIMEOUT" });
    client.release();
    await vi.waitFor(() => expect(runtimePoolSnapshot(pool).admitted).toBe(0));
    client.release();
    expect(borrowed.release).toHaveBeenCalledTimes(1);
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      leased: 0,
      acquisitionTimeouts: 1,
      connectionFailures: 0,
      acquisitions: 1,
    });
    await pool.end();
  });

  it("preserves failure reasons on the callback API and never logs driver details", async () => {
    const { pool, pending } = fixture();
    const failure = new Promise<Error | undefined>((resolve) =>
      pool.connect((error) => resolve(error)),
    );
    pending[0]!.reject(new Error("credential or host secret"));
    expect(await failure).toMatchObject({
      reason: "CONNECT_ERROR",
      message: "Service temporarily unavailable.",
    });
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      connectionFailures: 1,
      acquisitionTimeouts: 0,
      admitted: 0,
    });
    await pool.end();
  });

  it("disposes a late checkout after operation expiry without issuing queries", async () => {
    vi.useFakeTimers();
    const { pool, pending, makeClient } = fixture();
    let now = performance.now();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const expired = withDatabaseDeadline(10, () => pool.connect()).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(11);
    expect(await expired).toMatchObject({ reason: "OPERATION_DEADLINE" });
    now += 11;
    const late = makeClient();
    pending[0]!.resolve(late.client);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.release).toHaveBeenCalledWith(true);
    expect(late.query).not.toHaveBeenCalled();
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      expiredAcquisitions: 1,
      admitted: 0,
    });
    await pool.end();
  });

  it("destroys a failed reset and counts watchdog disposal, preserving admission", async () => {
    vi.useFakeTimers();
    const { pool, pending, makeClient } = fixture();
    const checkout = pool.connect();
    const borrowed = makeClient();
    pending[0]!.resolve(borrowed.client);
    const client = await checkout;
    borrowed.query.mockRejectedValueOnce(new Error("reset failed"));
    client.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(borrowed.release).toHaveBeenCalledWith(true);
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      releaseFailures: 1,
      admitted: 0,
    });
    const abandoned = pool.connect();
    const next = makeClient();
    pending[1]!.resolve(next.client);
    await abandoned;
    await vi.advanceTimersByTimeAsync(1001);
    expect(runtimePoolSnapshot(pool)).toMatchObject({
      leaseExpirations: 1,
      admitted: 0,
    });
    await pool.end();
  });
});
