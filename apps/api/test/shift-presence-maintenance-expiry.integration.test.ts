import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";
import { presenceTransaction } from "./shift-presence-test-helpers";

const db = new PresenceServerTestContext("presence-maintenance-expiry");
beforeAll(async () => {
  await db.setup();
}, 120_000);
afterAll(() => db.teardown(), 60_000);
const maintain = async (limit = 1000) =>
  (
    await db.adminPool.query(`SELECT shift_presence_maintain($1) AS result`, [
      limit,
    ])
  ).rows[0].result;

async function ageException(exceptionId: string) {
  await presenceTransaction(db.adminPool, async (tx) => {
    await tx.query(
      `ALTER TABLE shift_presence_exceptions DISABLE TRIGGER USER`,
    );
    await tx.query(
      `WITH t AS MATERIALIZED (SELECT clock_timestamp() AS at)
      UPDATE shift_presence_exceptions SET requested_at=t.at-interval '301 seconds',expires_at=t.at-interval '1 second',
        reviewed_at=CASE WHEN status='APPROVED' THEN t.at-interval '2 seconds' ELSE NULL END
      FROM t WHERE id=$1`,
      [exceptionId],
    );
    await tx.query(`ALTER TABLE shift_presence_exceptions ENABLE TRIGGER USER`);
  });
}

describe("Exception expiry is independent of ephemeral operation/challenge state", () => {
  it.each(["PENDING", "APPROVED"] as const)(
    "expires %s history after its Operation terminalized",
    async (status) => {
      const a = await pendingPresenceException(db);
      if (status === "APPROVED") {
        await a.approve();
        await db.policy(a.fixture, "OFF");
        expect((await a.consume()).status).toBe("ACTIVE");
        // OFF action did not use the approval, and consumed Challenge can purge now.
        expect((await maintain()).purgedChallenges).toBe(1);
      } else {
        await expect(
          db.start(
            a.fixture,
            a.requester.context,
            db.measured(a.challenge, 32.1),
          ),
        ).rejects.toMatchObject({ code: "PRESENCE_REJECTED" });
      }
      await ageException(String(a.exception.exceptionId));
      const before = (
        await db.adminPool.query(
          `SELECT reviewed_at,reviewer_user_id,expires_at,revision FROM shift_presence_exceptions WHERE id=$1`,
          [a.exception.exceptionId],
        )
      ).rows[0];
      expect(await maintain()).toMatchObject({
        expiredOperations: 0,
        expiredExceptions: 1,
      });
      const expired = (
        await db.adminPool.query(
          `SELECT status,revision,reviewed_at,reviewer_user_id,expires_at,terminal_at,expiry_cause FROM shift_presence_exceptions WHERE id=$1`,
          [a.exception.exceptionId],
        )
      ).rows[0];
      expect(expired).toMatchObject({
        ...before,
        status: "EXPIRED",
        revision: before.revision + 1,
        expiry_cause: null,
      });
      expect(expired.terminal_at.getTime()).toBeGreaterThanOrEqual(
        expired.expires_at.getTime(),
      );
      expect((await maintain()).expiredExceptions).toBe(0);
      expect(await db.facts(a.fixture)).toEqual({
        shifts: status === "APPROVED" ? 1 : 0,
        decisions: status === "APPROVED" ? 1 : 0,
        starts: status === "APPROVED" ? 1 : 0,
        ends: 0,
      });
    },
  );
  it("bounds independent terminalization to the requested batch", async () => {
    const ids: string[] = [];
    for (let count = 0; count < 2; count += 1) {
      const a = await pendingPresenceException(db);
      await expect(
        db.start(
          a.fixture,
          a.requester.context,
          db.measured(a.challenge, 32.1),
        ),
      ).rejects.toMatchObject({ code: "PRESENCE_REJECTED" });
      ids.push(String(a.exception.exceptionId));
      await ageException(ids.at(-1)!);
    }
    expect((await maintain(1)).expiredExceptions).toBe(1);
    expect(
      (
        await db.adminPool.query(
          `SELECT id FROM shift_presence_exceptions WHERE id=ANY($1::uuid[]) AND status='EXPIRED'`,
          [ids],
        )
      ).rowCount,
    ).toBe(1);
    expect((await maintain(1)).expiredExceptions).toBe(1);
    expect((await maintain(1)).expiredExceptions).toBe(0);
  });
});
