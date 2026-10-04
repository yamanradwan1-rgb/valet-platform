import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { noEvidenceCase } from "./shift-presence-no-evidence-test-helper";
import { presenceTransaction } from "./shift-presence-test-helpers";

const db = new PresenceServerTestContext("presence-no-evidence-retention");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);

describe("OFF retains result independently of its unconsumed challenge", () => {
  it.each(["START", "END"] as const)(
    "%s cleanup preserves exact recovery until 14 days and tombstone until 90 days",
    async (action) => {
      const c = await noEvidenceCase(db, action);
      const original = await c.run();
      const projected = {
        shiftId: original.shiftId,
        locationId: original.locationId,
        status: original.status,
        startedAt: original.startedAt.toISOString(),
        endedAt: original.endedAt?.toISOString() ?? null,
        ...(action === "END"
          ? {
              cashReconciliation: JSON.parse(
                JSON.stringify(original.cashReconciliation),
              ),
            }
          : {}),
      };
      const maintain = async () =>
        db.adminPool.query(`SELECT shift_presence_maintain(1000)`);
      await maintain();
      expect(
        (
          await db.adminPool.query(
            `SELECT id FROM shift_presence_challenges WHERE id=$1`,
            [c.challenge.challengeId],
          )
        ).rowCount,
      ).toBe(1);
      const ageChallenge = async (age: string) =>
        presenceTransaction(db.adminPool, async (tx) => {
          await tx.query(
            `ALTER TABLE shift_presence_challenges DISABLE TRIGGER USER`,
          );
          await tx.query(
            `WITH t AS (SELECT clock_timestamp()-$2::interval AS at)
        UPDATE shift_presence_challenges SET expires_at=t.at,issued_at=t.at-interval '300 seconds' FROM t WHERE id=$1`,
            [c.challenge.challengeId, age],
          );
          await tx.query(
            `ALTER TABLE shift_presence_challenges ENABLE TRIGGER USER`,
          );
        });
      await ageChallenge("23 hours");
      await maintain();
      expect(
        (
          await db.adminPool.query(
            `SELECT id FROM shift_presence_challenges WHERE id=$1`,
            [c.challenge.challengeId],
          )
        ).rowCount,
      ).toBe(1);
      await ageChallenge("24 hours 1 second");
      await maintain();
      expect(
        (
          await db.adminPool.query(
            `SELECT id FROM shift_presence_challenges WHERE id=$1`,
            [c.challenge.challengeId],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        await db.presence.status(c.auth.context, c.challenge.operationId),
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "COMMITTED",
        result: projected,
        decisionId: null,
      });
      expect(await c.run()).toEqual(original);
      const ageOperation = async (age: string) =>
        presenceTransaction(db.adminPool, async (tx) => {
          await tx.query(
            `ALTER TABLE shift_presence_operations DISABLE TRIGGER USER`,
          );
          await tx.query(
            `WITH t AS (SELECT clock_timestamp()-$2::interval AS at)
        UPDATE shift_presence_operations SET created_at=t.at-interval '301 seconds',expires_at=t.at-interval '1 second',terminal_at=t.at FROM t WHERE operation_id=$1`,
            [c.challenge.operationId, age],
          );
          await tx.query(
            `ALTER TABLE shift_presence_operations ENABLE TRIGGER USER`,
          );
        });
      await ageOperation("14 days 1 second");
      expect(
        await db.presence.status(c.auth.context, c.challenge.operationId),
      ).toEqual({ state: "EXPIRED", operationId: c.challenge.operationId });
      await maintain();
      expect(await c.row()).toMatchObject({
        status: "COMMITTED",
        completion_basis: "OFF_NO_EVIDENCE",
      });
      await ageOperation("89 days");
      await maintain();
      expect(await c.row()).toBeDefined();
      await ageOperation("90 days 1 second");
      await maintain();
      expect(await c.row()).toBeUndefined();
      expect(await db.facts(c.f)).toEqual({
        shifts: 1,
        decisions: 0,
        starts: 1,
        ends: action === "END" ? 1 : 0,
      });
    },
  );
});
