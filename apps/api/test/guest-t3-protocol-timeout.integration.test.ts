import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { withDatabaseOperationDeadline } from "../src/common/database/runtime-database-deadline";
import { ShiftTestContext } from "./shift-test-context";

function pauseResponses(transaction: PostgresTransaction) {
  (
    transaction as unknown as { connection: { stream: { pause(): void } } }
  ).connection.stream.pause();
}

describe("T3 real PostgreSQL COMMIT and ROLLBACK response timeouts", () => {
  const context = new ShiftTestContext("t3_protocol_response_timeout");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);
  const key = (letter: string) =>
    "anti-abuse-hmac-sha256:v1:" + letter.repeat(64);

  async function count(letter: string) {
    return (
      await context.adminPool.query(
        "SELECT count(*)::int AS count FROM anti_abuse_events WHERE key_hash=$1",
        [key(letter)],
      )
    ).rows[0].count;
  }

  async function healthyWithoutAbandonedWork() {
    expect(context.runtimePool.totalCount).toBe(0);
    let active = -1;
    for (let index = 0; index < 40; index += 1) {
      active = (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename=$1 AND (state='active' OR state LIKE '%transaction%')",
          [context.runtimeRole],
        )
      ).rows[0].count;
      if (active === 0) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    expect(active).toBe(0);
    expect((await context.runtimePool.query("SELECT 1 AS ok")).rows[0].ok).toBe(
      1,
    );
  }

  it("bounds an actual lost ROLLBACK response, destroys its lease and preserves no effect", async () => {
    let pid = 0;
    let paused!: () => void;
    const atResponseLoss = new Promise<void>((resolve) => {
      paused = resolve;
    });
    const start = performance.now();
    const result = withDatabaseOperationDeadline(() =>
      inPostgresTransaction(context.runtimePool, async (transaction) => {
        pid = (await transaction.query("SELECT pg_backend_pid() AS pid"))
          .rows[0].pid;
        await transaction.query(
          "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES('v1:guest-token',$1,'COUNTED')",
          [key("a")],
        );
        pauseResponses(transaction);
        paused();
        throw new Error("authoritative domain abort");
      }),
    ).catch((error: unknown) => error);
    await atResponseLoss;
    let rolledBack = false;
    for (let index = 0; index < 40; index += 1) {
      const observed = await context.adminPool.query(
        "SELECT query='ROLLBACK' AND state='idle' AND xact_start IS NULL AS rolled_back FROM pg_stat_activity WHERE pid=$1 AND datname=$2 AND usename=$3",
        [pid, context.databaseName, context.runtimeRole],
      );
      rolledBack = observed.rows[0]?.rolled_back === true;
      if (rolledBack) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    // The server has completed ROLLBACK while pg is still missing its response.
    expect(rolledBack).toBe(true);
    expect(await result).toMatchObject({
      message: "authoritative domain abort",
    });
    expect(performance.now() - start).toBeGreaterThan(3400);
    expect(performance.now() - start).toBeLessThan(5000);
    expect(await count("a")).toBe(0);
    await healthyWithoutAbandonedWork();
  }, 10_000);

  it("keeps a server COMMIT with an actually lost response ambiguous without replay", async () => {
    let actions = 0;
    const start = performance.now();
    await expect(
      withDatabaseOperationDeadline(() =>
        inPostgresTransaction(context.runtimePool, async (transaction) => {
          actions += 1;
          await transaction.query(
            "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES('v1:guest-token',$1,'COUNTED')",
            [key("b")],
          );
          // COMMIT runs at the server while incoming protocol frames are paused.
          pauseResponses(transaction);
        }),
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(performance.now() - start).toBeGreaterThan(3400);
    expect(performance.now() - start).toBeLessThan(5000);
    expect(actions).toBe(1);
    expect(await count("b")).toBe(1);
    await healthyWithoutAbandonedWork();
  }, 10_000);
});
