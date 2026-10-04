import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";
import { presenceTransaction } from "./shift-presence-test-helpers";

const db = new PresenceServerTestContext("presence-maintenance");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);

async function ageOperation(operationId: string, age: string, terminal = true) {
  await presenceTransaction(db.adminPool, async (tx) => {
    await tx.query(
      `ALTER TABLE shift_presence_operations DISABLE TRIGGER USER`,
    );
    await tx.query(
      `WITH t AS (SELECT clock_timestamp()-$2::interval AS at) UPDATE shift_presence_operations
      SET created_at=t.at-interval '300 seconds',expires_at=t.at,terminal_at=CASE WHEN $3 THEN t.at ELSE NULL END
      FROM t WHERE operation_id=$1`,
      [operationId, age, terminal],
    );
    await tx.query(`ALTER TABLE shift_presence_operations ENABLE TRIGGER USER`);
  });
}
const maintain = async (limit = 1000) =>
  (
    await db.adminPool.query(`SELECT shift_presence_maintain($1) AS result`, [
      limit,
    ])
  ).rows[0].result as Record<string, number>;

describe("bounded privileged retention executes against real runtime grants", () => {
  it("runtime cannot DELETE, execute maintenance, set expiry cause or execute trigger helpers", async () => {
    const f = await db.createFixture();
    const session = await db.session(f.userId);
    await db.challenge(f, session.context);
    await expect(
      db.runtimePool.query(`DELETE FROM shift_presence_operations`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.runtimePool.query(`SELECT shift_presence_maintain(1)`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.runtimePool.query(
        `UPDATE shift_presence_exceptions SET expiry_cause='APPROVER_AUTHORITY_REVOKED'`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    for (const name of [
      "shift_presence_guard_policy",
      "shift_presence_guard_history",
      "shift_presence_guard_linkage",
      "shift_presence_guard_denial",
    ]) {
      expect(
        (
          await db.adminPool.query(
            `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`,
            [db.runtimeRole, `${name}()`],
          )
        ).rows[0].allowed,
      ).toBe(false);
    }
    await expect(maintain(0)).rejects.toMatchObject({ code: "22023" });
  });
  it("purges consumed challenge immediately, keeps exact Decision and limits result recovery to 14 days", async () => {
    const f = await db.createFixture();
    await db.policy(f, "WARN_ONLY");
    const session = await db.session(f.userId);
    const challenge = await db.challenge(f, session.context);
    await db.start(f, session.context, db.measured(challenge, 31.95001));
    expect((await maintain()).purgedChallenges).toBe(1);
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM shift_presence_decisions WHERE user_id=$1`,
          [f.userId],
        )
      ).rows[0].count,
    ).toBe(1);
    await ageOperation(challenge.operationId, "14 days 1 second");
    expect(
      await db.presence.status(session.context, challenge.operationId),
    ).toEqual({ operationId: challenge.operationId, state: "EXPIRED" });
    expect((await maintain()).purgedOperations).toBe(0);
    await ageOperation(challenge.operationId, "90 days 1 second");
    expect((await maintain()).purgedOperations).toBe(1);
    const rows = await db.adminPool.query(
      `SELECT * FROM shift_presence_decisions WHERE user_id=$1`,
      [f.userId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toHaveProperty("operation_id", challenge.operationId);
    for (const key of [
      "latitude",
      "longitude",
      "measurement",
      "client_sample_id",
      "target_fingerprint",
      "request_fingerprint",
    ])
      expect(rows.rows[0]).not.toHaveProperty(key);
    expect(JSON.stringify(rows.rows)).not.toContain("31.95001");
  });
  it("expires pending operation/exception and purges unconsumed challenge only after 24 hours", async () => {
    const a = await pendingPresenceException(db);
    await presenceTransaction(db.adminPool, async (tx) => {
      for (const table of [
        "shift_presence_operations",
        "shift_presence_challenges",
        "shift_presence_exceptions",
      ])
        await tx.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
      await tx.query(
        `UPDATE shift_presence_operations SET created_at=clock_timestamp()-interval '301 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE operation_id=$1`,
        [a.challenge.operationId],
      );
      await tx.query(
        `UPDATE shift_presence_challenges SET issued_at=clock_timestamp()-interval '301 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
        [a.challenge.challengeId],
      );
      await tx.query(
        `UPDATE shift_presence_exceptions SET requested_at=clock_timestamp()-interval '301 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
        [a.exception.exceptionId],
      );
      for (const table of [
        "shift_presence_operations",
        "shift_presence_challenges",
        "shift_presence_exceptions",
      ])
        await tx.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    });
    const first = await maintain();
    expect(first.expiredOperations).toBe(1);
    expect(first.purgedChallenges).toBe(0);
    expect(
      (
        await db.adminPool.query(
          `SELECT status,revision FROM shift_presence_exceptions WHERE id=$1`,
          [a.exception.exceptionId],
        )
      ).rows[0],
    ).toEqual({ status: "EXPIRED", revision: 2 });
    await presenceTransaction(db.adminPool, async (tx) => {
      await tx.query(
        `ALTER TABLE shift_presence_challenges DISABLE TRIGGER USER`,
      );
      await tx.query(
        `UPDATE shift_presence_challenges SET issued_at=clock_timestamp()-interval '25 hours 300 seconds',expires_at=clock_timestamp()-interval '25 hours' WHERE id=$1`,
        [a.challenge.challengeId],
      );
      await tx.query(
        `ALTER TABLE shift_presence_challenges ENABLE TRIGGER USER`,
      );
    });
    expect((await maintain()).purgedChallenges).toBe(1);
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM shift_presence_exceptions WHERE id=$1`,
          [a.exception.exceptionId],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("purges independent Decision and consumed Exception at their 24 UTC calendar-month selectors", async () => {
    const a = await pendingPresenceException(db);
    await a.approve();
    await a.consume();
    await maintain();
    await ageOperation(a.challenge.operationId, "91 days");
    await maintain();
    await presenceTransaction(db.adminPool, async (tx) => {
      await tx.query(
        `ALTER TABLE shift_presence_decisions DISABLE TRIGGER USER`,
      );
      await tx.query(
        `UPDATE shift_presence_decisions SET decided_at=clock_timestamp()-interval '25 months' WHERE exception_id=$1`,
        [a.exception.exceptionId],
      );
      await tx.query(
        `ALTER TABLE shift_presence_decisions ENABLE TRIGGER USER`,
      );
      await tx.query(
        `ALTER TABLE shift_presence_exceptions DISABLE TRIGGER USER`,
      );
      await tx.query(
        `WITH t AS(SELECT clock_timestamp()-interval '25 months' AS at) UPDATE shift_presence_exceptions
        SET requested_at=t.at-interval '10 seconds',reviewed_at=t.at-interval '5 seconds',terminal_at=t.at,
        expires_at=t.at+interval '290 seconds' FROM t WHERE id=$1`,
        [a.exception.exceptionId],
      );
      await tx.query(
        `ALTER TABLE shift_presence_exceptions ENABLE TRIGGER USER`,
      );
    });
    const result = await maintain();
    expect(result.purgedDecisions).toBe(1);
    expect(result.purgedExceptions).toBe(1);
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM shifts WHERE membership_id=$1`,
          [a.fixture.membershipId],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      await db.countAudit(
        (
          await db.adminPool.query(
            `SELECT id FROM shifts WHERE membership_id=$1`,
            [a.fixture.membershipId],
          )
        ).rows[0].id,
        "SHIFT_STARTED",
      ),
    ).toBe(1);
  });
  it("the real operator CLI reports aggregates only and rejects runtime credentials", async () => {
    const script = resolve(
      "../../packages/database/scripts/shift-presence-maintenance.mjs",
    );
    const command = promisify(execFile);
    const result = await command(process.execPath, [script], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        MIGRATION_DATABASE_URL: db.migrationUrl,
      },
      windowsHide: true,
    });
    const counts = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(counts).toMatchObject({
      batches: 1,
      purgedDecisions: 0,
      purgedOperations: 0,
    });
    expect(Object.keys(counts).sort()).toEqual([
      "batches",
      "expiredExceptions",
      "expiredOperations",
      "purgedChallenges",
      "purgedDecisions",
      "purgedExceptions",
      "purgedOperations",
    ]);
    await expect(
      command(process.execPath, [script], {
        env: {
          ...process.env,
          NODE_ENV: "test",
          MIGRATION_DATABASE_URL: db.runtimeUrl,
        },
        windowsHide: true,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Shift Presence maintenance failed."),
    });
  });
});
