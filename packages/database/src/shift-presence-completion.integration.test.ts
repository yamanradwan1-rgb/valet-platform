import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceTestContext } from "./shift-presence-test-context.js";
import { presenceAllocation } from "./shift-presence-fixture.js";

const db = new PresenceTestContext();
let before: Record<string, unknown>[];
beforeAll(async () => {
  await db.setup(async () => {
    const f = await db.fixture();
    const committed = {
      ...(await presenceAllocation(db.admin, f)),
      decisionId: randomUUID(),
    };
    await db.admin.query(
      `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$3 WHERE id=$1`,
      [committed.operationRowId, "b".repeat(64), "c".repeat(64)],
    );
    await db.admin.query(
      `INSERT INTO shift_presence_decisions
      (id,organization_id,location_id,user_id,membership_id,action,shift_id,operation_id,challenge_id,
       policy_fingerprint,classification,reason,accuracy_band,freshness_band,applied_mode,company_policy_revision,location_policy_revision)
      VALUES ($1,$2,$3,$4,$5,'START',$6,$7,$8,$9,'CONFIDENT_INSIDE','INSIDE','ACCEPTABLE','ACCEPTABLE','OFF',1,1)`,
      [
        committed.decisionId,
        f.organizationId,
        f.locationId,
        f.userId,
        f.membershipId,
        f.shiftId,
        committed.operationId,
        committed.challengeId,
        "c".repeat(64),
      ],
    );
    await db.admin.query(
      `UPDATE shift_presence_challenges SET consumed_at=clock_timestamp(),decision_id=$2 WHERE id=$1`,
      [committed.challengeId, committed.decisionId],
    );
    await db.admin.query(
      `UPDATE shift_presence_operations SET status='COMMITTED',result_shift_id=$2,result_decision_id=$3 WHERE id=$1`,
      [committed.operationRowId, f.shiftId, committed.decisionId],
    );
    await presenceAllocation(db.admin, f);
    const denied = await presenceAllocation(db.admin, f);
    await db.admin.query(
      `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$2 WHERE id=$1`,
      [denied.operationRowId, "d".repeat(64)],
    );
    await db.admin.query(
      `UPDATE shift_presence_operations SET status='DENIED',denial_reason='PRESENCE_REQUIRED' WHERE id=$1`,
      [denied.operationRowId],
    );
    before = (
      await db.admin.query(
        `SELECT to_jsonb(o) AS fact FROM shift_presence_operations o ORDER BY id`,
      )
    ).rows;
  }, "20261004006700");
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("real 066→067 upgrade and narrow OFF completion integrity", () => {
  it("preserves pending, historical Decision-backed committed and denied rows without backfill", async () => {
    const after = (
      await db.admin.query(
        `SELECT to_jsonb(o)-'completion_basis' AS fact FROM shift_presence_operations o ORDER BY id`,
      )
    ).rows;
    expect(after).toEqual(before);
    expect(
      (
        await db.admin.query(
          `SELECT completion_basis FROM shift_presence_operations`,
        )
      ).rows.every((r) => r.completion_basis === null),
    ).toBe(true);
    expect(
      (
        await db.admin.query(
          `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='shift_presence_completion_basis' ORDER BY e.enumsortorder`,
        )
      ).rows,
    ).toEqual([
      { enumlabel: "OFF_NO_EVIDENCE" },
      { enumlabel: "NO_EFFECT_CONVERGENCE" },
    ]);
  });

  it("extends only completion UPDATE and guards provenance under the existing allocation grant", async () => {
    expect(
      (
        await db.admin.query(
          `SELECT
      has_column_privilege($1,'shift_presence_operations','completion_basis','UPDATE') AS completion,
      has_column_privilege($1,'shift_presence_operations','completion_basis','INSERT') AS allocation,
      has_table_privilege($1,'shift_presence_operations','UPDATE') AS broad,
      has_table_privilege($1,'shift_presence_operations','DELETE') AS deletion,
      has_function_privilege($1,'shift_presence_guard_completion()','EXECUTE') AS helper`,
          [db.runtimeRole],
        )
      ).rows[0],
    ).toEqual({
      completion: true,
      allocation: true,
      broad: false,
      deletion: false,
      helper: false,
    });
    const f = await db.fixture();
    const a = await presenceAllocation(db.runtime, f);
    for (const pool of [db.admin, db.runtime])
      await expect(
        pool.query(
          `INSERT INTO shift_presence_operations
      (id,organization_id,location_id,user_id,membership_id,operation_id,action,target_fingerprint,completion_basis)
      SELECT gen_random_uuid(),organization_id,location_id,user_id,membership_id,gen_random_uuid(),action,target_fingerprint,'OFF_NO_EVIDENCE'
      FROM shift_presence_operations WHERE id=$1`,
          [a.operationRowId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.runtime.query(
        `UPDATE shift_presence_operations SET location_id=$2 WHERE id=$1`,
        [a.operationRowId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.runtime.query(`DELETE FROM shift_presence_operations WHERE id=$1`, [
        a.operationRowId,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it.each([
    "NO_BASIS",
    "UNBOUND",
    "BIND_AND_COMPLETE",
    "WARN_ONLY",
    "WRONG_SCOPE",
    "NO_CHALLENGE",
  ] as const)("rejects forged no-Decision completion: %s", async (attack) => {
    const f = await db.fixture();
    const a = await presenceAllocation(db.runtime, f);
    if (attack !== "UNBOUND" && attack !== "BIND_AND_COMPLETE")
      await db.runtime.query(
        `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$2 WHERE id=$1`,
        [a.operationRowId, "b".repeat(64)],
      );
    if (attack === "WARN_ONLY")
      await db.admin.query(
        `UPDATE organizations SET shift_start_presence_mode='WARN_ONLY' WHERE id=$1`,
        [f.organizationId],
      );
    let shiftId = f.shiftId;
    if (attack === "WRONG_SCOPE") shiftId = (await db.fixture()).shiftId;
    if (attack === "NO_CHALLENGE") {
      const owner = await db.admin.connect();
      try {
        await owner.query("BEGIN");
        await owner.query(
          `ALTER TABLE shift_presence_challenges DISABLE TRIGGER USER`,
        );
        await owner.query(`DELETE FROM shift_presence_challenges WHERE id=$1`, [
          a.challengeId,
        ]);
        await owner.query(
          `ALTER TABLE shift_presence_challenges ENABLE TRIGGER USER`,
        );
        await owner.query("COMMIT");
      } catch (error) {
        await owner.query("ROLLBACK");
        throw error;
      } finally {
        owner.release();
      }
    }
    const binding =
      attack === "BIND_AND_COMPLETE"
        ? `,request_fingerprint='${"b".repeat(64)}',request_policy_fingerprint='${"b".repeat(64)}'`
        : "";
    await expect(
      db.runtime.query(
        `UPDATE shift_presence_operations SET status='COMMITTED',result_shift_id=$2,completion_basis=$3${binding} WHERE id=$1`,
        [
          a.operationRowId,
          shiftId,
          attack === "NO_BASIS" ? null : "OFF_NO_EVIDENCE",
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (
        await db.admin.query(
          `SELECT status,completion_basis FROM shift_presence_operations WHERE id=$1`,
          [a.operationRowId],
        )
      ).rows[0],
    ).toEqual({ status: "PENDING", completion_basis: null });
  });

  it("permits only a bound OFF result and protects terminal provenance/request identity for owner and runtime", async () => {
    const f = await db.fixture();
    const a = await presenceAllocation(db.runtime, f);
    await db.runtime.query(
      `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$3 WHERE id=$1`,
      [a.operationRowId, "b".repeat(64), "c".repeat(64)],
    );
    await db.runtime.query(
      `UPDATE shift_presence_operations SET status='COMMITTED',result_shift_id=$2,completion_basis='OFF_NO_EVIDENCE' WHERE id=$1`,
      [a.operationRowId, f.shiftId],
    );
    expect(
      (
        await db.runtime.query(
          `SELECT status,result_decision_id,completion_basis FROM shift_presence_operations WHERE id=$1`,
          [a.operationRowId],
        )
      ).rows[0],
    ).toEqual({
      status: "COMMITTED",
      result_decision_id: null,
      completion_basis: "OFF_NO_EVIDENCE",
    });
    for (const pool of [db.admin, db.runtime]) {
      for (const column of [
        "completion_basis",
        "request_fingerprint",
        "result_shift_id",
      ])
        await expect(
          pool.query(
            `UPDATE shift_presence_operations SET ${column}=NULL WHERE id=$1`,
            [a.operationRowId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
    }
    expect(
      (
        await db.runtime.query(
          `SELECT count(*)::int AS n FROM shift_presence_decisions WHERE operation_id=$1`,
          [a.operationId],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
