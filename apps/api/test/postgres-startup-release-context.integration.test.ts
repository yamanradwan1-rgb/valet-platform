import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { RuntimeDatabaseLifecycle } from "../src/common/database/runtime-database.module";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import {
  isGuestDatabaseOperation,
  remainingDatabaseOperationMs,
} from "../src/common/database/runtime-database-deadline";
import { runtimeDatabaseBudgets } from "../src/common/database/runtime-postgres-policy";
import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { createStaffOperationalContextQuery } from "../src/modules/staff/staff-operational-context-query";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("startup_release_context");
beforeAll(async () => {
  await context.setup();
  await context.runtimePool.end();
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl, {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "1",
    DATABASE_POOL_MAX_WAITERS: "128",
  });
}, 120_000);
afterAll(() => context.teardown(), 60_000);

function deadlineState() {
  let expired = false;
  try {
    remainingDatabaseOperationMs();
  } catch {
    expired = true;
  }
  return { scoped: isGuestDatabaseOperation(), expired };
}

describe("native pg startup socket context and later authorized Staff release", () => {
  it("resets in the lease owner context after the original startup deadline expired", async () => {
    const actor = await context.createFixture();
    const credential = generateStaffCredential("vsa1.");
    await context.adminPool.query(
      `INSERT INTO staff_auth_sessions
       (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,created_at,last_rotated_at)
       VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes',
         clock_timestamp()+interval '30 days',clock_timestamp(),clock_timestamp())`,
      [randomUUID(), actor.userId, staffCredentialHash("access", credential)],
    );
    const callbackContexts: ReturnType<typeof deadlineState>[] = [];
    const resetContexts: ReturnType<typeof deadlineState>[] = [];
    const connected: PoolClient[] = [];
    context.runtimePool.on("connect", (client) => {
      connected.push(client);
      const query = client.query.bind(client);
      client.query = ((...args: unknown[]) => {
        const text =
          typeof args[0] === "string"
            ? args[0]
            : (args[0] as { text?: string })?.text;
        if (text?.startsWith("RESET statement_timeout;"))
          resetContexts.push(deadlineState());
        const callback = args.at(-1);
        if (
          text?.startsWith("SELECT session.id") &&
          typeof callback === "function"
        ) {
          args[args.length - 1] = (...results: unknown[]) => {
            // Observe the genuine driver's context without changing/rebinding it.
            callbackContexts.push(deadlineState());
            return callback(...results);
          };
        }
        return Reflect.apply(query, client, args);
      }) as PoolClient["query"];
    });
    // Production startup creates the first socket in the six-second DB scope.
    await new RuntimeDatabaseLifecycle(
      context.runtimePool,
    ).onApplicationBootstrap();
    expect(context.runtimePool.totalCount).toBe(1);
    await new Promise<void>((resolve) =>
      setTimeout(resolve, runtimeDatabaseBudgets.operationMs + 25),
    );
    expect(deadlineState()).toEqual({ scoped: false, expired: false });
    const principal = await new DatabaseStaffSessionContextResolver(
      context.runtimePool,
    ).resolve(`Bearer ${credential}`);
    expect(principal.userId).toBe(actor.userId);
    const response = await createStaffOperationalContextQuery(
      context.runtimePool,
    )(principal.userId);
    expect(response.contexts[0]?.membershipId).toBe(actor.membershipId);
    await vi.waitFor(() =>
      expect(runtimePoolSnapshot(context.runtimePool).admitted).toBe(0),
    );
    const snapshot = runtimePoolSnapshot(context.runtimePool);
    process.stdout.write(
      "RELEASE_CONTEXT_REPRO " +
        JSON.stringify({
          successfulAuthorizedOperations: 1,
          releaseFailures: snapshot.releaseFailures,
          operationDeadlineResetFailures: snapshot.resetFailureReasons?.[6],
          resetDriverCalls: snapshot.phaseCounts?.[6],
          acquisitions: snapshot.acquisitions,
          completions: snapshot.leaseCompletions,
          connectionsCreated: connected.length,
        }) +
        "\n",
    );
    // Falsifies expiry of the current Staff operation: only the socket scope is old.
    expect(callbackContexts).toEqual([{ scoped: true, expired: true }]);
    expect(snapshot).toMatchObject({
      releaseFailures: 0,
      resetFailureReasons: [0, 0, 0, 0, 0, 0, 0, 0],
      acquisitions: 3,
      leaseCompletions: 3,
      admitted: 0,
      leased: 0,
      active: 0,
      acquisitionTimeouts: 0,
      queryTimeouts: 0,
      expiredAcquisitions: 0,
    });
    expect(resetContexts).toEqual([
      { scoped: false, expired: false },
      { scoped: false, expired: false },
    ]);
    expect(snapshot.phaseCounts?.[6]).toBe(2);
    expect(connected).toHaveLength(1);
    const next = await context.runtimePool.connect();
    try {
      expect(next).toBe(connected[0]);
      const settings = await next.query(
        "SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock",
      );
      expect(settings.rows[0]).toEqual({ statement: "15s", lock: "5s" });
    } finally {
      next.release();
    }
  }, 15_000);
});
