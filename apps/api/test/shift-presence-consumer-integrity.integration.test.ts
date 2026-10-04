import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("presence-consumer-integrity");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("real runtime-role minimized summary integrity", () => {
  it("retains minimized tombstone facts without disclosing summary beyond exact recovery horizon", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    await db.policy(f, "REQUIRE");
    await db.zone(f);
    const a = await db.challenge(f, auth.context);
    await expect(
      db.start(f, auth.context, db.measured(a, 32.1)),
    ).rejects.toMatchObject({ code: "PRESENCE_REJECTED" });
    const owner = await db.adminPool.connect();
    try {
      await owner.query("BEGIN");
      await owner.query(
        `ALTER TABLE shift_presence_operations DISABLE TRIGGER USER`,
      );
      await owner.query(
        `WITH t AS MATERIALIZED (SELECT clock_timestamp()-interval '14 days 1 second' AS at)
        UPDATE shift_presence_operations SET created_at=t.at-interval '301 seconds',
        expires_at=t.at-interval '1 second',terminal_at=t.at FROM t WHERE operation_id=$1`,
        [a.operationId],
      );
      await owner.query(
        `ALTER TABLE shift_presence_operations ENABLE TRIGGER USER`,
      );
      await owner.query("COMMIT");
    } catch (error) {
      await owner.query("ROLLBACK");
      throw error;
    } finally {
      owner.release();
    }
    expect(await db.presence.status(auth.context, a.operationId)).toEqual({
      state: "EXPIRED",
      operationId: a.operationId,
    });
    expect(
      (
        await db.adminPool.query(
          `SELECT denial_classification,denial_measurement_reason FROM
      shift_presence_operations WHERE operation_id=$1`,
          [a.operationId],
        )
      ).rows[0],
    ).toEqual({
      denial_classification: "CONFIDENT_OUTSIDE",
      denial_measurement_reason: "OUTSIDE",
    });
  });
  it.each([
    ["PENDING", "PRESENCE_REJECTED", "CONFIDENT_OUTSIDE", "OUTSIDE"],
    ["DENIED", null, "CONFIDENT_OUTSIDE", "OUTSIDE"],
    ["DENIED", "PRESENCE_REQUIRED", "CONFIDENT_OUTSIDE", "OUTSIDE"],
    ["DENIED", "PRESENCE_REJECTED", "CONFIDENT_OUTSIDE", "EDGE"],
    ["DENIED", "PRESENCE_REJECTED", "CONFIDENT_INSIDE", "INSIDE"],
    ["DENIED", "PRESENCE_REJECTED", "CONFIDENT_OUTSIDE", null],
    ["DENIED", "PRESENCE_REJECTED", null, "OUTSIDE"],
  ])(
    "rejects contradictory %s/%s/%s/%s",
    async (status, denial, classification, reason) => {
      const f = await db.createFixture();
      const auth = await db.session(f.userId);
      const a = await db.challenge(f, auth.context);
      await expect(
        db.runtimePool.query(
          `UPDATE shift_presence_operations SET status=$2,
      request_fingerprint=$6,request_policy_fingerprint=$6,denial_reason=$3,
      denial_classification=$4,denial_measurement_reason=$5 WHERE operation_id=$1`,
          [
            a.operationId,
            status,
            denial,
            classification,
            reason,
            "b".repeat(64),
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (
          await db.adminPool.query(
            `SELECT status,denial_classification,denial_measurement_reason FROM shift_presence_operations WHERE operation_id=$1`,
            [a.operationId],
          )
        ).rows[0],
      ).toEqual({
        status: "PENDING",
        denial_classification: null,
        denial_measurement_reason: null,
      });
    },
  );
  it("summary columns cannot be written at INSERT, without a bound attempt, or after terminalization", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const a = await db.challenge(f, auth.context);
    await expect(
      db.runtimePool.query(
        `UPDATE shift_presence_operations SET status='DENIED',
      denial_reason='PRESENCE_REJECTED',denial_classification='CONFIDENT_OUTSIDE',
      denial_measurement_reason='OUTSIDE' WHERE operation_id=$1`,
        [a.operationId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await db.policy(f, "REQUIRE");
    await db.zone(f);
    await expect(
      db.start(f, auth.context, db.measured(a, 32.1)),
    ).rejects.toMatchObject({ code: "PRESENCE_REJECTED" });
    for (const pool of [db.runtimePool, db.adminPool]) {
      await expect(
        pool.query(
          `UPDATE shift_presence_operations SET denial_classification=NULL,
        denial_measurement_reason=NULL WHERE operation_id=$1`,
          [a.operationId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        pool.query(
          `INSERT INTO shift_presence_operations
        (id,organization_id,location_id,user_id,membership_id,operation_id,action,target_fingerprint,
         denial_classification,denial_measurement_reason)
        SELECT gen_random_uuid(),organization_id,location_id,user_id,membership_id,gen_random_uuid(),action,
          target_fingerprint,denial_classification,denial_measurement_reason
        FROM shift_presence_operations WHERE operation_id=$1`,
          [a.operationId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }
    const privileges = await db.adminPool.query(
      `SELECT
      has_column_privilege($1,'shift_presence_operations','denial_classification','UPDATE') AS classification,
      has_column_privilege($1,'shift_presence_operations','denial_measurement_reason','UPDATE') AS reason,
      has_table_privilege($1,'shift_presence_operations','UPDATE') AS broad,
      has_table_privilege($1,'shift_presence_operations','DELETE') AS deletion`,
      [db.runtimeRole],
    );
    expect(privileges.rows[0]).toEqual({
      classification: true,
      reason: true,
      broad: false,
      deletion: false,
    });
  });
});
