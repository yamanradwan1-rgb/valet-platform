import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";

const db = new PresenceServerTestContext("presence-approver");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("DEC-100 original approver authority, independent of historical session/MFA", () => {
  it.each(["START", "END"] as const)(
    "revoked original LM atomically expires %s approval and persists exact denial",
    async (action) => {
      const a = await pendingPresenceException(db, action, "LOCATION_MANAGER");
      const approved = await a.approve();
      await db.adminPool.query(
        `DELETE FROM membership_location_access WHERE membership_id=$1`,
        [a.manager.membershipId],
      );
      await expect(a.consume()).rejects.toMatchObject({
        code: "APPROVER_AUTHORITY_REVOKED",
      });
      await expect(a.consume()).rejects.toMatchObject({
        code: "APPROVER_AUTHORITY_REVOKED",
      });
      const row = (
        await db.adminPool.query(
          `SELECT status,revision,expiry_cause,reviewed_at,reviewer_user_id,expires_at,terminal_at
      FROM shift_presence_exceptions WHERE id=$1`,
          [a.exception.exceptionId],
        )
      ).rows[0];
      expect(row).toMatchObject({
        status: "EXPIRED",
        revision: 3,
        expiry_cause: "APPROVER_AUTHORITY_REVOKED",
        reviewer_user_id: a.manager.userId,
      });
      expect(row.reviewed_at.toISOString()).toBe(approved.reviewedAt);
      expect(row.expires_at.toISOString()).toBe(approved.expiresAt);
      expect(row.terminal_at.getTime()).toBeLessThan(row.expires_at.getTime());
      expect(
        await db.presence.status(a.requester.context, a.challenge.operationId),
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "DENIED",
        denialReason: "APPROVER_AUTHORITY_REVOKED",
        result: null,
      });
      expect(await db.facts(a.fixture)).toEqual({
        shifts: action === "END" ? 1 : 0,
        decisions: 0,
        starts: action === "END" ? 1 : 0,
        ends: 0,
      });
      const audits = await db.adminPool.query(
        `SELECT metadata_json FROM audit_events WHERE event_type='SHIFT_PRESENCE_APPROVAL_EXPIRED' AND organization_id=$1`,
        [a.fixture.organizationId],
      );
      expect(audits.rows).toEqual([
        {
          metadata_json: { reason: "APPROVER_AUTHORITY_REVOKED", revision: 3 },
        },
      ]);
    },
  );
  it("inactive Location takes narrow owned START denial path without granting mutation authority", async () => {
    const a = await pendingPresenceException(db);
    await a.approve();
    await db.adminPool.query(
      `UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1`,
      [a.fixture.locationId],
    );
    await expect(a.consume()).rejects.toMatchObject({
      code: "APPROVER_AUTHORITY_REVOKED",
    });
    expect(
      await db.presence.status(a.requester.context, a.challenge.operationId),
    ).toMatchObject({
      state: "RECOVERABLE",
      denialReason: "APPROVER_AUTHORITY_REVOKED",
    });
    expect(await db.facts(a.fixture)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
  });
  it.each(["LOGOUT", "SESSION_EXPIRY", "MFA_AGE"])(
    "%s alone preserves approved authority",
    async (control) => {
      const a = await pendingPresenceException(db);
      await a.approve();
      if (control === "LOGOUT")
        await db.adminPool.query(
          `UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`,
          [a.manager.context.staffAuthSessionId],
        );
      if (control === "SESSION_EXPIRY")
        await db.adminPool.query(
          `UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '2 hours',access_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
          [a.manager.context.staffAuthSessionId],
        );
      if (control === "MFA_AGE")
        await db.adminPool.query(
          `UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '7 minutes',mfa_authenticated_at=clock_timestamp()-interval '6 minutes' WHERE id=$1`,
          [a.manager.context.staffAuthSessionId],
        );
      expect((await a.consume()).status).toBe("ACTIVE");
      expect(
        (
          await db.presence.exception(
            a.requester.context,
            String(a.exception.exceptionId),
          )
        ).status,
      ).toBe("CONSUMED");
      expect(await db.facts(a.fixture)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: 0,
      });
    },
  );
  it("contended second-principal proof rolls back without pretending authority was revoked", async () => {
    const a = await pendingPresenceException(db);
    await a.approve();
    const blocker = await db.adminPool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [
        a.manager.userId,
      ]);
      await expect(a.consume()).rejects.toMatchObject({
        code: "PRESENCE_AUTHORITY_BUSY",
      });
      expect(
        (
          await db.presence.exception(
            a.requester.context,
            String(a.exception.exceptionId),
          )
        ).status,
      ).toBe("APPROVED");
      expect(
        await db.presence.status(a.requester.context, a.challenge.operationId),
      ).toMatchObject({ state: "PENDING" });
      expect(await db.facts(a.fixture)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
      await blocker.query("ROLLBACK");
      expect((await a.consume()).status).toBe("ACTIVE");
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });
});
