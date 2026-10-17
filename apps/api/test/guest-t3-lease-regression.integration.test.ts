import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpException } from "@nestjs/common";
import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { withDatabaseOperationDeadline } from "../src/common/database/runtime-database-deadline";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { ShiftTestContext } from "./shift-test-context";

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
describe("T3 scoped deadlines and real pool lease lifecycle", () => {
  const context = new ShiftTestContext("t3_scoped_lease_regression");
  let pool: PostgresPool;
  const settings = {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "1",
    DATABASE_POOL_MAX_WAITERS: "2",
    DATABASE_GENERAL_STATEMENT_MS: "10000",
    DATABASE_GENERAL_TRANSACTION_MS: "15000",
    DATABASE_GENERAL_IDLE_TRANSACTION_MS: "8000",
  };
  beforeAll(async () => {
    await context.setup();
    await context.runtimePool.end();
    pool = createRuntimePostgresPool(context.runtimeUrl, settings);
  }, 120_000);
  afterAll(async () => {
    context.runtimePool = pool;
    await context.teardown();
  }, 60_000);
  const runner = new ApiOperationRunner(
    { now: () => performance.now() },
    { observe: () => {} },
  );
  const request = () => ({ headers: {}, requestId: "scoped-regression" });

  it("retains a legitimate >6s non-Guest runner, statement and transaction", async () => {
    const start = performance.now();
    const result = await runner.run(
      "STAFF_COMPATIBILITY_PROBE",
      request(),
      () =>
        inPostgresTransaction(pool, async (transaction) => {
          await transaction.query("SELECT pg_sleep(6.2)");
          return (await transaction.query("SELECT 1 AS ok")).rows[0].ok;
        }),
    );
    expect(result).toBe(1);
    expect(performance.now() - start).toBeGreaterThan(6100);
    await withDatabaseOperationDeadline(async () => {
      // Guest requests install their PG17 timeout on the TRANSACTION, not
      // on an out-of-transaction pool.query (which legitimately reads 0).
      const native = await inPostgresTransaction(pool, (transaction) =>
        transaction.query<{ statement: string; transaction_ms: number }>(
          `SELECT current_setting('statement_timeout') AS statement,
             (EXTRACT(EPOCH FROM current_setting('transaction_timeout')::interval) * 1000)::int
               AS transaction_ms`,
        ),
      );
      expect(native.rows[0]?.statement).toBe("3s");
      expect(native.rows[0]?.transaction_ms).toBeGreaterThan(0);
      expect(native.rows[0]?.transaction_ms).toBeLessThanOrEqual(5000);
    });
  }, 12_000);

  it("returns a finite safe Guest failure and forbids a delayed precommit write", async () => {
    let resume!: () => void;
    const suspended = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let settled!: Promise<unknown>;
    const start = performance.now();
    const result = await runner
      .run(
        { name: "GUEST_SESSION_READ", databaseDeadline: "GUEST_T3" },
        request(),
        () => {
          settled = inPostgresTransaction(pool, async (transaction) => {
            await transaction.query(
              "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES('v1:guest-token','anti-abuse-hmac-sha256:v1:'||repeat('f',64),'COUNTED')",
            );
            await suspended;
            await transaction.query("SELECT 1");
          }).catch((error: unknown) => error);
          return settled.then((outcome) => {
            throw outcome;
          });
        },
      )
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(HttpException);
    expect((result as HttpException).getResponse()).toMatchObject({
      code: "ANTI_ABUSE_UNAVAILABLE",
    });
    expect(performance.now() - start).toBeLessThan(6700);
    resume();
    await settled;
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM anti_abuse_events",
        )
      ).rows[0].count,
    ).toBe(0);
    expect(pool.totalCount).toBe(0);
  }, 10_000);

  it("reuses max=1 safely through 300 leases, duplicate releases, callback APIs and native pool.query", async () => {
    let prior: (() => void) | undefined;
    const pids = new Set<number>();
    for (let index = 0; index < 300; index += 1) {
      const client = await pool.connect();
      prior?.();
      pids.add(
        (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
      );
      const release = client.release.bind(client);
      release();
      release();
      prior = release;
    }
    expect(pids.size).toBe(1);
    await new Promise<void>((resolve, reject) =>
      pool.connect((error, client, release) => {
        if (error || !client) {
          reject(error);
          return;
        }
        client.query("SELECT 1 AS ok", (queryError) => {
          release();
          if (queryError) reject(queryError);
          else resolve();
        });
      }),
    );
    await new Promise<void>((resolve, reject) =>
      pool.query("SELECT 1 AS ok", (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    await wait(25);
    expect(pool.totalCount).toBe(1);
    expect(pool.idleCount).toBe(1);
    expect(pool.waitingCount).toBe(0);
  }, 20_000);

  it("disposes an abandoned borrower on real server termination without waiting for its callback", async () => {
    const client = await pool.connect();
    const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    await client.query("BEGIN");
    await context.adminPool.query("SELECT pg_terminate_backend($1)", [pid]);
    for (let index = 0; index < 40 && pool.totalCount !== 0; index += 1)
      await wait(25);
    expect(pool.totalCount).toBe(0);
    client.release();
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  });

  it("shuts down with a held borrower and queued acquisitions, then recreates a healthy pool", async () => {
    const held = await pool.connect();
    const pending = pool.connect().catch((error: unknown) => error);
    const start = performance.now();
    await pool.end();
    expect(await pending).toBeInstanceOf(Error);
    expect(performance.now() - start).toBeLessThan(3000);
    held.release();
    expect(pool.totalCount).toBe(0);
    expect(pool.waitingCount).toBe(0);
    pool = createRuntimePostgresPool(context.runtimeUrl, settings);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  }, 6000);

  it("allows a legitimate general lock wait beyond the Guest two-second ceiling", async () => {
    const holder = await context.adminPool.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(700076,1)");
    const unlocked = wait(2200).then(async () => {
      await holder.query("ROLLBACK");
      holder.release();
    });
    const start = performance.now();
    await inPostgresTransaction(pool, (transaction) =>
      transaction.query("SELECT pg_advisory_xact_lock(700076,1)"),
    );
    await unlocked;
    expect(performance.now() - start).toBeGreaterThan(2100);
  }, 7000);

  it("bounds public checkout even when the native configuration response is lost", async () => {
    const prior = await pool.connect();
    prior.release(true);
    const pause = (client: import("pg").PoolClient) => {
      (
        client as unknown as { connection: { stream: { pause(): void } } }
      ).connection.stream.pause();
    };
    pool.once("connect", pause);
    const start = performance.now();
    await expect(pool.connect()).rejects.toBeDefined();
    expect(performance.now() - start).toBeLessThan(2600);
    expect(pool.totalCount).toBe(0);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  }, 6000);

  it("forces disposal during a lost reset response and rejects in-flight checkout on shutdown", async () => {
    const client = await pool.connect();
    (
      client as unknown as { connection: { stream: { pause(): void } } }
    ).connection.stream.pause();
    client.release();
    const start = performance.now();
    await pool.end();
    expect(performance.now() - start).toBeLessThan(1500);
    client.release();
    pool = createRuntimePostgresPool(context.runtimeUrl, settings);
    const inFlight = pool.connect().catch((error: unknown) => error);
    await pool.end();
    expect(await inFlight).toBeInstanceOf(Error);
    expect(pool.totalCount).toBe(0);
    pool = createRuntimePostgresPool(context.runtimeUrl, settings);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  }, 6000);

  it("bounds a general borrower whose callback never resumes even outside a transaction", async () => {
    await pool.end();
    pool = createRuntimePostgresPool(context.runtimeUrl, {
      ...settings,
      DATABASE_GENERAL_LOCK_MS: "500",
      DATABASE_GENERAL_STATEMENT_MS: "1000",
      DATABASE_GENERAL_TRANSACTION_MS: "2000",
      DATABASE_GENERAL_IDLE_TRANSACTION_MS: "1000",
    });
    const abandoned = await pool.connect();
    await wait(2200);
    expect(pool.totalCount).toBe(0);
    abandoned.release();
    pool =
      (await pool.end(),
      createRuntimePostgresPool(context.runtimeUrl, settings));
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  }, 6000);

  it("survives repeated rollback paths without persisting effects or consuming admission", async () => {
    for (let index = 0; index < 30; index += 1) {
      await expect(
        inPostgresTransaction(pool, async (transaction) => {
          await transaction.query(
            "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES('v1:guest-token','anti-abuse-hmac-sha256:v1:'||repeat('d',64),'COUNTED')",
          );
          throw new Error("rollback probe");
        }),
      ).rejects.toThrow("rollback probe");
    }
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM anti_abuse_events",
        )
      ).rows[0].count,
    ).toBe(0);
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  });

  it("keeps an acknowledged server COMMIT with a lost response ambiguous and never replays", async () => {
    let actions = 0;
    await expect(
      inPostgresTransaction(pool, async (transaction) => {
        actions += 1;
        const query = transaction.query.bind(transaction);
        transaction.query = (async (...args: unknown[]) => {
          const result = await Reflect.apply(query, transaction, args);
          if (args[0] === "COMMIT")
            throw new Error("Connection terminated unexpectedly");
          return result;
        }) as typeof transaction.query;
        await transaction.query(
          "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES('v1:guest-token','anti-abuse-hmac-sha256:v1:'||repeat('e',64),'COUNTED')",
        );
      }),
    ).rejects.toThrow("Connection terminated unexpectedly");
    expect(actions).toBe(1);
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM anti_abuse_events",
        )
      ).rows[0].count,
    ).toBe(1);
  });
});
