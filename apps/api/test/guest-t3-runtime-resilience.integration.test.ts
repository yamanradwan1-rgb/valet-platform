import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  RuntimeDatabaseUnavailableError,
  withDatabaseOperationDeadline,
  remainingDatabaseOperationMs,
} from "../src/common/database/runtime-database-deadline";
import { ShiftTestContext } from "./shift-test-context";
import { RuntimeDatabaseLifecycle } from "../src/common/database/runtime-database.module";
import { mapApiError } from "../src/common/http/api-errors";
import { insertGuestT3Probe } from "./guest-t3-s04-transaction-probe";
import { GuestT3PostgresActivityObserver } from "./guest-t3-postgres-activity-observer";

describe("T3 real PostgreSQL server deadlines and bounded admission", () => {
  const context = new ShiftTestContext("t3_runtime_deadlines");
  let pool: PostgresPool;
  beforeAll(async () => {
    await context.setup();
    pool = createRuntimePostgresPool(context.runtimeUrl, {
      NODE_ENV: "test",
      DATABASE_GENERAL_LOCK_MS: "2000",
      DATABASE_GENERAL_STATEMENT_MS: "3000",
      DATABASE_GENERAL_TRANSACTION_MS: "5000",
      DATABASE_GENERAL_IDLE_TRANSACTION_MS: "2000",
      DATABASE_POOL_MAX: "1",
      DATABASE_POOL_MAX_WAITERS: "1",
    });
  }, 120_000);
  afterAll(async () => {
    await pool?.end();
    await context.teardown();
  }, 60_000);

  async function noPersistedEffect() {
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM anti_abuse_events",
        )
      ).rows[0].count,
    ).toBe(0);
    const observer = new GuestT3PostgresActivityObserver(
      context.runtimeUrl,
      context.databaseName,
      context.runtimeRole,
    );
    // PostgreSQL can still be finishing the server-side cancellation when
    // the driver's bounded query rejects. Require it to stop within 1s,
    // rather than mistaking that in-flight cancellation for abandoned work.
    let active: Awaited<ReturnType<typeof observer.active>> = [];
    try {
      await observer.connect();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        active = await observer.active();
        if (active.length === 0) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
    } finally {
      await observer.end();
    }
    expect(active).toEqual([]);
    expect(
      (
        await pool.query(
          "SELECT 1 AS healthy, current_setting('transaction_timeout') AS budget",
        )
      ).rows[0],
    ).toEqual({ healthy: 1, budget: "5s" });
  }

  it("verifies actual server settings and refuses a connection with a disabled deadline", async () => {
    const lifecycle = new RuntimeDatabaseLifecycle(pool);
    await lifecycle.onApplicationBootstrap();
    await withDatabaseOperationDeadline(async () => {
      const client = await pool.connect();
      await client.query("SET statement_timeout = 0");
      client.release();
      await expect(lifecycle.onApplicationBootstrap()).rejects.toThrow(
        "PostgreSQL 16+ with verified supported deadlines",
      );
      await pool.query("SET statement_timeout = '3s'");
      await lifecycle.onApplicationBootstrap();
    });
  });

  it("rejects an overfull queue immediately and removes timed-out acquisition", async () => {
    const held = await pool.connect();
    const started = performance.now();
    const pending = pool.connect().then(
      () => "unexpected",
      (error: unknown) => error,
    );
    await expect(pool.connect()).rejects.toBeInstanceOf(
      RuntimeDatabaseUnavailableError,
    );
    expect(performance.now() - started).toBeLessThan(250);
    expect(await pending).toBeInstanceOf(RuntimeDatabaseUnavailableError);
    expect(performance.now() - started).toBeLessThan(2500);
    expect(pool.waitingCount).toBe(0);
    held.release();
    await noPersistedEffect();
  });

  it("fails closed on real PostgreSQL role connection exhaustion and recovers without queued work", async () => {
    const held = await pool.connect();
    await context.adminPool.query(
      `ALTER ROLE "${context.runtimeRole}" CONNECTION LIMIT 1`,
    );
    const exhausted = createRuntimePostgresPool(context.runtimeUrl, {
      NODE_ENV: "test",
      DATABASE_POOL_MAX: "1",
    });
    try {
      const started = performance.now();
      await expect(exhausted.connect()).rejects.toBeInstanceOf(
        RuntimeDatabaseUnavailableError,
      );
      expect(performance.now() - started).toBeLessThan(2500);
      expect(exhausted.totalCount).toBe(0);
      expect(exhausted.waitingCount).toBe(0);
    } finally {
      await exhausted.end();
      await context.adminPool.query(
        `ALTER ROLE "${context.runtimeRole}" CONNECTION LIMIT -1`,
      );
      held.release();
    }
    await noPersistedEffect();
  });

  it("destroys a genuinely disconnected socket, rolls back and maps the untyped pg error safely", async () => {
    const error = await inPostgresTransaction(pool, async (transaction) => {
      await insertGuestT3Probe(transaction, "a");
      const disconnected = new Promise<void>((resolve) =>
        transaction.once("end", resolve),
      );
      (
        transaction as unknown as {
          connection: { stream: { destroy(): void } };
        }
      ).connection.stream.destroy();
      await disconnected;
      await transaction.query("COMMIT");
    }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(mapApiError(error)).toMatchObject({
      status: 503,
      code: "INTERNAL_ERROR",
    });
    await noPersistedEffect();
  }, 10_000);

  it("cancels a real long statement at the server and rolls back prior writes", async () => {
    const started = performance.now();
    await expect(
      inPostgresTransaction(pool, async (transaction) => {
        await insertGuestT3Probe(transaction, "a");
        await transaction.query("SELECT pg_sleep(10)");
      }),
    ).rejects.toMatchObject({ code: "57014" });
    expect(performance.now() - started).toBeLessThan(4500);
    await noPersistedEffect();
  }, 10_000);

  it("terminates the full transaction even when individual statements stay below 3s", async () => {
    const started = performance.now();
    let completedShortStatements = 0;
    const failure = await inPostgresTransaction(pool, async (transaction) => {
      await insertGuestT3Probe(transaction, "a");
      for (let index = 0; index < 4; index += 1) {
        await transaction.query("SELECT pg_sleep(1.8)");
        completedShortStatements += 1;
      }
    }).then(
      () => null,
      (error: unknown) => error,
    );
    // The PG17 native timeout or the bounded lease watchdog can terminate
    // the socket first. Both are fail-closed; neither may commit the write.
    const observed = failure as { code?: string; message?: string } | null;
    expect(completedShortStatements).toBeGreaterThanOrEqual(2);
    expect(
      observed?.code === "25P04" ||
        observed?.message === "Connection terminated" ||
        observed?.message === "Connection terminated unexpectedly",
    ).toBe(true);
    expect(performance.now() - started).toBeGreaterThan(3400);
    expect(performance.now() - started).toBeLessThan(6500);
    await noPersistedEffect();
  }, 10_000);

  it("bounds advisory lock contention and releases the failed transaction", async () => {
    const holder = await context.adminPool.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(700075,1)");
    try {
      await expect(
        inPostgresTransaction(pool, async (transaction) => {
          await insertGuestT3Probe(transaction, "a");
          await transaction.query("SELECT pg_advisory_xact_lock(700075,1)");
        }),
      ).rejects.toMatchObject({ code: "55P03" });
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    await noPersistedEffect();
  }, 10_000);

  it("bounds the whole multi-transaction operation and cancels its remaining server work", async () => {
    const started = performance.now();
    let appBudgetMs = 0;
    let nativeBudgetMs = 0;
    await expect(
      withDatabaseOperationDeadline(async () => {
        await inPostgresTransaction(pool, (transaction) =>
          transaction.query("SELECT pg_sleep(1.8)"),
        );
        await inPostgresTransaction(pool, async (transaction) => {
          appBudgetMs = remainingDatabaseOperationMs();
          const native = await transaction.query(
            "SELECT EXTRACT(epoch FROM current_setting('transaction_timeout')::interval)*1000 AS budget",
          );
          nativeBudgetMs = Number(native.rows[0].budget);
          await insertGuestT3Probe(transaction, "a");
          for (let index = 0; index < 4; index += 1)
            await transaction.query("SELECT pg_sleep(1.6)");
        });
      }),
    ).rejects.toBeDefined();
    expect(appBudgetMs).toBeLessThan(4500);
    expect(nativeBudgetMs).toBeLessThan(4500);
    expect(performance.now() - started).toBeGreaterThan(5800);
    expect(performance.now() - started).toBeLessThan(6700);
    // The same-role observer below verifies that no transaction or server
    // statement remains, not just that the driver's pool is available.
    await noPersistedEffect();
  }, 10_000);

  it("destroys the lease even if an application callback never resumes after server idle termination", async () => {
    await expect(
      withDatabaseOperationDeadline(() =>
        inPostgresTransaction(pool, async (transaction) => {
          await insertGuestT3Probe(transaction, "a");
          await new Promise<void>(() => undefined);
        }),
      ),
    ).rejects.toBeInstanceOf(RuntimeDatabaseUnavailableError);
    expect(pool.totalCount).toBe(0);
    expect(pool.waitingCount).toBe(0);
    await noPersistedEffect();
  }, 10_000);

  it("restores the native connection setting after a successful shortened transaction", async () => {
    let observedBudgetMs = 0;
    await withDatabaseOperationDeadline(async () => {
      await inPostgresTransaction(pool, (transaction) =>
        transaction.query("SELECT pg_sleep(1.2)"),
      );
      await inPostgresTransaction(pool, async (transaction) => {
        const setting = await transaction.query(
          "SELECT EXTRACT(epoch FROM current_setting('transaction_timeout')::interval)*1000 AS budget",
        );
        observedBudgetMs = Number(setting.rows[0].budget);
        await transaction.query("SELECT pg_sleep(0.2)");
      });
    });
    expect(observedBudgetMs).toBeGreaterThan(0);
    expect(observedBudgetMs).toBeLessThan(4900);
    await new RuntimeDatabaseLifecycle(pool).onApplicationBootstrap();
    await noPersistedEffect();
  }, 10_000);
});
