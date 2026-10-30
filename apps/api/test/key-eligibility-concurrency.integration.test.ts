import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import { lockAuthorizedKeySession } from "../src/modules/keys/key-session-authorization";
import { expectKeyError, KeyTestContext } from "./key-test-context";

const context = new KeyTestContext("eligibility");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function waitForBlockedKeyQuery(
  pool: Pool,
  blockerPid: number,
  queryFragment: string,
  expected = 1,
): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const result = await pool.query<{ count: number }>(
      `WITH RECURSIVE blocked(pid) AS (
         SELECT $1::integer
         UNION
         SELECT activity.pid FROM pg_stat_activity AS activity
         JOIN blocked AS parent
           ON parent.pid = ANY(pg_blocking_pids(activity.pid))
         WHERE activity.datname = current_database()
           AND activity.wait_event_type = 'Lock'
       )
       SELECT count(*)::integer AS count
       FROM pg_stat_activity AS activity
       INNER JOIN blocked ON blocked.pid = activity.pid
       WHERE activity.pid <> $1 AND activity.query ILIKE $2`,
      [blockerPid, "%" + queryFragment + "%"],
    );
    if (
      (result.rows[0]?.count ?? 0) >= expected &&
      performance.now() <= deadline
    )
      return;
    await pause(Math.min(20, Math.max(1, deadline - performance.now())));
  }
  throw new Error(
    "Expected " +
      expected +
      " blocked key query(s) matching " +
      queryFragment +
      ".",
  );
}

describe("VAL-005C authorization and concurrency", () => {
  it("allows at most one winner when two sessions race for one slot", async () => {
    const fixture = await context.createKeyFixture();
    const secondSessionId = await context.addSession(fixture);
    const execute = createAssignKeySlotCommandExecutor(context.runtimePool);
    const blocker = await context.adminPool.connect();
    let race: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await blocker.query("BEGIN");
      const blockerPid = (
        await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      await blocker.query("SELECT id FROM key_slots WHERE id = $1 FOR UPDATE", [
        fixture.slotId,
      ]);
      race = Promise.allSettled([
        execute({
          authenticatedUserId: fixture.userId,
          expectedVersion: 1,
          keySlotCode: fixture.slotCode,
          sessionId: fixture.sessionId,
        }),
        execute({
          authenticatedUserId: fixture.userId,
          expectedVersion: 1,
          keySlotCode: fixture.slotCode,
          sessionId: secondSessionId,
        }),
      ]);
      await waitForBlockedKeyQuery(
        context.adminPool,
        blockerPid,
        "FROM key_slots",
        2,
      );
      await blocker.query("COMMIT");
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await race?.catch(() => undefined);
    }
    const settled = await race!;

    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = settled.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE",
    });
    const occupancy = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM valet_sessions WHERE key_slot_id = $1`,
      [fixture.slotId],
    );
    expect(occupancy.rows[0]?.count).toBe("1");
    const custody = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM key_custody_events WHERE key_slot_id = $1`,
      [fixture.slotId],
    );
    expect(custody.rows[0]?.count).toBe("1");
    const sessions = await Promise.all([
      context.session(fixture.sessionId),
      context.session(secondSessionId),
    ]);
    expect(sessions.map((session) => session?.version).sort()).toEqual([1, 2]);
    const audits = await Promise.all([
      context.keyAuditEvents(fixture.sessionId),
      context.keyAuditEvents(secondSessionId),
    ]);
    expect(audits.flat()).toHaveLength(1);
  }, 30_000);

  it("does not treat possession of a session UUID or slot code as authority", async () => {
    const target = await context.createKeyFixture();
    const intruder = await context.createKeyFixture();

    await expectKeyError(
      createAssignKeySlotCommandExecutor(context.runtimePool)({
        authenticatedUserId: intruder.userId,
        expectedVersion: 1,
        keySlotCode: target.slotCode,
        sessionId: target.sessionId,
      }),
      "TENANT_ACCESS_DENIED",
    );
    expect(await context.session(target.sessionId)).toMatchObject({
      key_slot_id: null,
      state: "AWAITING_PARKING",
      version: 1,
    });
    expect(await context.custodyEvents(target.sessionId)).toHaveLength(0);
    expect(await context.keyAuditEvents(target.sessionId)).toHaveLength(0);
  });

  it.each([
    [
      "disabled User",
      `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
      "userId",
    ],
    [
      "inactive membership",
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      "membershipId",
    ],
    [
      "inactive Organization",
      `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
      "organizationId",
    ],
    [
      "inactive Location",
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
      "locationId",
    ],
    [
      "removed Location access",
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      "membershipId",
    ],
    [
      "disallowed role",
      `UPDATE organization_memberships SET role = 'ORG_ADMIN' WHERE id = $1`,
      "membershipId",
    ],
    [
      "ended Shift",
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      "membershipId",
    ],
  ] as const)("denies mutation after committed %s", async (_name, sql, key) => {
    const fixture = await context.createKeyFixture();
    await context.adminPool.query(sql, [fixture[key]]);

    await expectKeyError(
      createAssignKeySlotCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        keySlotCode: fixture.slotCode,
        sessionId: fixture.sessionId,
      }),
      "AUTHORIZATION_DENIED",
    );
    expect(await context.session(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      state: "AWAITING_PARKING",
      version: 1,
    });
  });

  it("holds eligibility facts locked through the caller transaction", async () => {
    const fixture = await context.createKeyFixture();
    const transaction = await context.runtimePool.connect();
    const revoker = await context.adminPool.connect();
    let removal: Promise<unknown> | undefined;
    try {
      await transaction.query("BEGIN");
      const blockerPid = (
        await transaction.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        )
      ).rows[0]!.pid;
      await lockAuthorizedKeySession(transaction, {
        authenticatedUserId: fixture.userId,
        sessionId: fixture.sessionId,
      });
      removal = revoker.query(
        "DELETE FROM membership_location_access WHERE membership_id = $1",
        [fixture.membershipId],
      );
      void removal.catch(() => undefined);
      await waitForBlockedKeyQuery(
        context.adminPool,
        blockerPid,
        "DELETE FROM membership_location_access",
      );
      await transaction.query("COMMIT");
      await removal;
    } finally {
      await transaction.query("ROLLBACK").catch(() => undefined);
      transaction.release();
      await removal?.catch(() => undefined);
      revoker.release();
    }
  }, 30_000);

  it("cannot use stale pre-lock authority after access revocation commits", async () => {
    const fixture = await context.createKeyFixture();
    const blocker = await context.adminPool.connect();
    let assignment: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      const blockerPid = (
        await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      await blocker.query(
        "SELECT id FROM valet_sessions WHERE id = $1 FOR UPDATE",
        [fixture.sessionId],
      );
      assignment = createAssignKeySlotCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        keySlotCode: fixture.slotCode,
        sessionId: fixture.sessionId,
      });
      void assignment.catch(() => undefined);
      await waitForBlockedKeyQuery(
        context.adminPool,
        blockerPid,
        "FROM valet_sessions",
      );
      await context.adminPool.query(
        "DELETE FROM membership_location_access WHERE membership_id = $1",
        [fixture.membershipId],
      );
      await blocker.query("COMMIT");
      await expectKeyError(assignment, "AUTHORIZATION_DENIED");
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await assignment?.catch(() => undefined);
    }
    expect(await context.session(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      state: "AWAITING_PARKING",
      version: 1,
    });
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(0);
    expect(await context.keyAuditEvents(fixture.sessionId)).toHaveLength(0);
  }, 30_000);
});
