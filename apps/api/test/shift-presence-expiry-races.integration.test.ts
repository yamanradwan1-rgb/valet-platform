import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";
import { presenceTransaction } from "./shift-presence-test-helpers";
import {
  observePresenceCommandWait,
  mutationAuditCount,
  finishPresenceBoundary,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-expiry-races");
beforeAll(async () => {
  await db.setup();
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("R08 expiry is decided by database wall clock after real lock waits", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "review waiting on Operation cannot approve after expiry; blocker %s",
    async (outcome) => {
      const a = await pendingPresenceException(db);
      // Privileged aged fixture models the final second of a normal 300-second intent.
      const expiresAt = await presenceTransaction(db.adminPool, async (tx) => {
        for (const table of [
          "shift_presence_operations",
          "shift_presence_challenges",
          "shift_presence_exceptions",
        ])
          await tx.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
        const time = (
          await tx.query<{ at: Date }>(
            `SELECT date_trunc('milliseconds',clock_timestamp())+interval '1 second' AS at`,
          )
        ).rows[0]!.at;
        await tx.query(
          `UPDATE shift_presence_operations SET created_at=$2::timestamptz-interval '300 seconds',expires_at=$2 WHERE operation_id=$1`,
          [a.challenge.operationId, time],
        );
        await tx.query(
          `UPDATE shift_presence_challenges SET issued_at=$2::timestamptz-interval '300 seconds',expires_at=$2 WHERE id=$1`,
          [a.challenge.challengeId, time],
        );
        await tx.query(
          `UPDATE shift_presence_exceptions SET requested_at=$2::timestamptz-interval '300 seconds',expires_at=$2 WHERE id=$1`,
          [a.exception.exceptionId, time],
        );
        for (const table of [
          "shift_presence_operations",
          "shift_presence_challenges",
          "shift_presence_exceptions",
        ])
          await tx.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
        return time;
      });
      const blocker = await db.adminPool.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          `SELECT id FROM shift_presence_operations WHERE operation_id=$1 FOR UPDATE`,
          [a.challenge.operationId],
        );
        const review = a.approve().catch((error) => error);
        await observePresenceCommandWait(db);
        const deadline = Date.now() + 2000;
        while (true) {
          const clock = (
            await db.adminPool.query<{ now: Date }>(
              `SELECT clock_timestamp() AS now`,
            )
          ).rows[0]!.now;
          if (clock >= expiresAt) break;
          if (Date.now() > deadline)
            throw new Error("Database expiry clock did not advance");
          await setImmediate();
        }
        const acknowledgement = await finishPresenceBoundary(
          blocker,
          outcome,
        ).catch((error) => error);
        if (outcome === "UNKNOWN")
          expect(acknowledgement).toMatchObject({
            message: "TEST_COMMIT_OUTCOME_UNKNOWN",
          });
        else expect(acknowledgement).toBeUndefined();
        expect(await review).toMatchObject({
          code: "PRESENCE_REVIEW_CONFLICT",
        });
        expect(
          await mutationAuditCount(
            db,
            a.fixture.organizationId,
            "SHIFT_PRESENCE_EXCEPTION_APPROVED",
          ),
        ).toBe(0);
        expect(
          (
            await db.adminPool.query(
              `SELECT status,revision FROM shift_presence_exceptions WHERE id=$1`,
              [a.exception.exceptionId],
            )
          ).rows[0],
        ).toEqual({ status: "PENDING", revision: 1 });
        await db.adminPool.query(`SELECT shift_presence_maintain(1000)`);
        expect(
          (
            await db.adminPool.query(
              `SELECT status,revision FROM shift_presence_exceptions WHERE id=$1`,
              [a.exception.exceptionId],
            )
          ).rows[0],
        ).toEqual({ status: "EXPIRED", revision: 2 });
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    },
  );
  it("stale sensitive assurance denies before any review or success audit", async () => {
    const a = await pendingPresenceException(db);
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '7 minutes',mfa_authenticated_at=clock_timestamp()-interval '6 minutes' WHERE id=$1`,
      [a.manager.context.staffAuthSessionId],
    );
    const row = (
      await db.adminPool.query<{ created_at: Date }>(
        `SELECT created_at FROM staff_auth_sessions WHERE id=$1`,
        [a.manager.context.staffAuthSessionId],
      )
    ).rows[0]!;
    await expect(
      db.management.review(
        { ...a.manager.context, createdAt: row.created_at },
        a.manager.target,
        String(a.exception.exceptionId),
        { expectedRevision: 1, mutationId: randomUUID() },
        "APPROVED",
      ),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect(
      await mutationAuditCount(
        db,
        a.fixture.organizationId,
        "SHIFT_PRESENCE_EXCEPTION_APPROVED",
      ),
    ).toBe(0);
  });
});
