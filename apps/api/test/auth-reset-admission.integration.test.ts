import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
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
import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("auth_reset_admission");
beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.runtimePool.end();
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl, {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "1",
    DATABASE_POOL_MAX_WAITERS: "1",
  });
});
afterAll(() => context.teardown(), 60_000);

function latch() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe("live authentication result and counted reset ownership", () => {
  it.each([false, true])(
    "keeps reset occupancy real and recovers (reset failure=%s)",
    async (failReset) => {
      const actor = await context.createFixture();
      const credential = generateStaffCredential("vsa1.");
      await context.adminPool.query(
        `INSERT INTO staff_auth_sessions
         (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,created_at,last_rotated_at)
       VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes',
         clock_timestamp()+interval '30 days',clock_timestamp(),clock_timestamp())`,
        [randomUUID(), actor.userId, staffCredentialHash("access", credential)],
      );
      const reset = latch();
      const pool = context.runtimePool;
      pool.once("connect", (client) => {
        const query = client.query.bind(client);
        let intercepted = false;
        client.query = ((...args: unknown[]) => {
          const text =
            typeof args[0] === "string"
              ? args[0]
              : (args[0] as { text?: string })?.text;
          if (!intercepted && text?.startsWith("RESET statement_timeout;")) {
            intercepted = true;
            // Hold only the first reset in the test, not authentication SQL.
            return reset.promise.then(() => {
              if (failReset) throw new Error("controlled reset failure");
              return Reflect.apply(query, client, args);
            });
          }
          return Reflect.apply(query, client, args);
        }) as PoolClient["query"];
      });
      let pending:
        Promise<{ client: PoolClient } | { error: unknown }> | undefined;
      try {
        const principal = await new DatabaseStaffSessionContextResolver(
          pool,
        ).resolve(`Bearer ${credential}`);
        expect(principal.userId).toBe(actor.userId);
        // A query result is not a promise that its asynchronous reset has ended.
        expect(runtimePoolSnapshot(pool)).toMatchObject({
          admitted: 1,
          leased: 1,
          waiting: 0,
        });
        pending = pool.connect().then(
          (client) => ({ client }),
          (error: unknown) => ({ error }),
        );
        expect(runtimePoolSnapshot(pool)).toMatchObject({
          admitted: 2,
          leased: 1,
          acquiring: 1,
          waiting: 1,
        });
        await expect(pool.connect()).rejects.toMatchObject({
          reason: "QUEUE_FULL",
        });
        reset.open();
        const outcome = await pending;
        if ("error" in outcome) throw outcome.error;
        expect(
          (
            await outcome.client.query(
              "SELECT 1 AS ok, current_setting('statement_timeout') AS budget",
            )
          ).rows[0],
        ).toEqual({ ok: 1, budget: "15s" });
        outcome.client.release();
        await vi.waitFor(() =>
          expect(runtimePoolSnapshot(pool).admitted).toBe(0),
        );
        expect(runtimePoolSnapshot(pool)).toMatchObject({
          acquisitions: 2,
          leaseCompletions: 2,
          rejected: 1,
          acquisitionTimeouts: 0,
          releaseFailures: failReset ? 1 : 0,
          leased: 0,
          acquiring: 0,
          waiting: 0,
          active: 0,
        });
      } finally {
        reset.open();
        const outcome = await pending;
        if (outcome && "client" in outcome) outcome.client.release();
      }
    },
    10_000,
  );
});
