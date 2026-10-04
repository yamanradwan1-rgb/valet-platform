import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceTestContext } from "./shift-presence-test-context.js";
import {
  presenceAllocation,
  presenceDecision,
} from "./shift-presence-fixture.js";

const db = new PresenceTestContext();
let prior: unknown[];
const bind = (id: string) =>
  db.runtime.query(
    `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$3 WHERE id=$1`,
    [id, "b".repeat(64), "c".repeat(64)],
  );
const complete = (
  id: string,
  shiftId: string,
  decisionId: string | null = null,
) =>
  db.runtime.query(
    `UPDATE shift_presence_operations SET status='COMMITTED',result_shift_id=$2,result_decision_id=$3,completion_basis='NO_EFFECT_CONVERGENCE' WHERE id=$1`,
    [id, shiftId, decisionId],
  );

beforeAll(async () => {
  await db.setup(async () => {
    const f = await db.fixture();
    const a = await presenceAllocation(db.admin, f);
    await db.admin.query(
      `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$3 WHERE id=$1`,
      [a.operationRowId, "b".repeat(64), "c".repeat(64)],
    );
    await db.admin.query(
      `UPDATE shift_presence_operations SET status='COMMITTED',result_shift_id=$2,completion_basis='OFF_NO_EVIDENCE' WHERE id=$1`,
      [a.operationRowId, f.shiftId],
    );
    await presenceAllocation(db.admin, f);
    const denied = await presenceAllocation(db.admin, f);
    await db.admin.query(
      `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$3 WHERE id=$1`,
      [denied.operationRowId, "b".repeat(64), "c".repeat(64)],
    );
    await db.admin.query(
      `UPDATE shift_presence_operations SET status='DENIED',denial_reason='PRESENCE_REQUIRED' WHERE id=$1`,
      [denied.operationRowId],
    );
    prior = (
      await db.admin.query(
        `SELECT to_jsonb(o) AS row FROM shift_presence_operations o ORDER BY id`,
      )
    ).rows;
  }, "20261004006800");
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("real 067→068 upgrade, typed no-effect integrity and least privilege", () => {
  it("preserves OFF mutation/pending/denial rows byte-for-field without backfill", async () => {
    expect(
      (
        await db.runtime.query(
          `SELECT to_jsonb(o) AS row FROM shift_presence_operations o ORDER BY id`,
        )
      ).rows,
    ).toEqual(prior);
    expect(
      (
        await db.admin.query(
          `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='shift_presence_completion_basis' ORDER BY enumsortorder`,
        )
      ).rows,
    ).toEqual([
      { enumlabel: "OFF_NO_EVIDENCE" },
      { enumlabel: "NO_EFFECT_CONVERGENCE" },
    ]);
  });

  it("keeps provenance out of allocation and preserves narrow existing runtime grants", async () => {
    const f = await db.fixture();
    const a = await presenceAllocation(db.runtime, f);
    await expect(
      db.runtime.query(
        `INSERT INTO shift_presence_operations
      (id,organization_id,location_id,user_id,membership_id,operation_id,action,target_fingerprint,completion_basis)
      SELECT gen_random_uuid(),organization_id,location_id,user_id,membership_id,gen_random_uuid(),action,target_fingerprint,'NO_EFFECT_CONVERGENCE'
      FROM shift_presence_operations WHERE id=$1`,
        [a.operationRowId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (
        await db.admin.query(
          `SELECT
      has_table_privilege($1,'shift_presence_operations','UPDATE') AS broad,
      has_table_privilege($1,'shift_presence_operations','DELETE') AS deletion,
      has_column_privilege($1,'shift_presence_operations','completion_basis','UPDATE') AS basis,
      has_function_privilege($1,'shift_presence_guard_completion()','EXECUTE') AS helper`,
          [db.runtimeRole],
        )
      ).rows[0],
    ).toEqual({ broad: false, deletion: false, basis: true, helper: false });
  });

  it.each([false, true])(
    "requires a prior immutable binding, same-statement bind=%s",
    async (simultaneous) => {
      const f = await db.fixture();
      const a = await presenceAllocation(db.runtime, f);
      const binding = simultaneous
        ? `,request_fingerprint='${"b".repeat(64)}',request_policy_fingerprint='${"c".repeat(64)}'`
        : "";
      await expect(
        db.runtime.query(
          `UPDATE shift_presence_operations SET status='COMMITTED',completion_basis='NO_EFFECT_CONVERGENCE',result_shift_id=$2${binding} WHERE id=$1`,
          [a.operationRowId, f.shiftId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );

  it.each(["WRONG_SCOPE", "WRONG_STATE"] as const)(
    "requires exact already-satisfied result: %s",
    async (attack) => {
      const f = await db.fixture();
      const a = await presenceAllocation(db.runtime, f);
      await bind(a.operationRowId);
      const shiftId =
        attack === "WRONG_SCOPE" ? (await db.fixture()).shiftId : f.shiftId;
      if (attack === "WRONG_STATE")
        await db.admin.query(
          `UPDATE shifts SET status='ENDED',ended_at=clock_timestamp() WHERE id=$1`,
          [f.shiftId],
        );
      await expect(complete(a.operationRowId, shiftId)).rejects.toMatchObject({
        code: "23514",
      });
    },
  );

  it.each([false, true])(
    "END requires exact ENDED cash snapshot, stored cash=%s",
    async (cash) => {
      const f = await db.fixture();
      await db.admin.query(
        cash
          ? `UPDATE shifts SET status='ENDED',ended_at=now(),cash_expected=0,cash_reported=7,cash_variance=7,cash_currency='JOD',cash_reported_at=now(),cash_reported_by_membership_id=membership_id WHERE id=$1`
          : `UPDATE shifts SET status='ENDED',ended_at=now() WHERE id=$1`,
        [f.shiftId],
      );
      const operationRowId = randomUUID(),
        operationId = randomUUID();
      await db.runtime.query(
        `INSERT INTO shift_presence_operations(id,organization_id,location_id,user_id,membership_id,operation_id,action,shift_id,target_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,'END',$7,$8)`,
        [
          operationRowId,
          f.organizationId,
          f.locationId,
          f.userId,
          f.membershipId,
          operationId,
          f.shiftId,
          "a".repeat(64),
        ],
      );
      await db.runtime.query(
        `INSERT INTO shift_presence_challenges(id,organization_id,location_id,user_id,membership_id,action,shift_id,operation_row_id)
      VALUES($1,$2,$3,$4,$5,'END',$6,$7)`,
        [
          randomUUID(),
          f.organizationId,
          f.locationId,
          f.userId,
          f.membershipId,
          f.shiftId,
          operationRowId,
        ],
      );
      await bind(operationRowId);
      if (cash) await complete(operationRowId, f.shiftId);
      else
        await expect(complete(operationRowId, f.shiftId)).rejects.toMatchObject(
          { code: "23514" },
        );
    },
  );

  it("rejects copying a different operation's Decision onto no-effect completion", async () => {
    const f = await db.fixture();
    const d = await presenceDecision(db.runtime, f);
    const a = await presenceAllocation(db.runtime, f);
    await bind(a.operationRowId);
    await expect(
      complete(a.operationRowId, f.shiftId, d.decisionId),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("permits bound no-effect result in WARN_ONLY without Decision and protects terminal identity", async () => {
    const f = await db.fixture();
    await db.admin.query(
      `UPDATE organizations SET shift_start_presence_mode='WARN_ONLY' WHERE id=$1`,
      [f.organizationId],
    );
    const a = await presenceAllocation(db.runtime, f);
    await bind(a.operationRowId);
    await complete(a.operationRowId, f.shiftId);
    expect(
      (
        await db.runtime.query(
          `SELECT status,completion_basis,result_decision_id FROM shift_presence_operations WHERE id=$1`,
          [a.operationRowId],
        )
      ).rows[0],
    ).toEqual({
      status: "COMMITTED",
      completion_basis: "NO_EFFECT_CONVERGENCE",
      result_decision_id: null,
    });
    for (const pool of [db.admin, db.runtime])
      for (const column of [
        "request_fingerprint",
        "request_policy_fingerprint",
        "completion_basis",
        "result_shift_id",
      ]) {
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
          `SELECT consumed_at FROM shift_presence_challenges WHERE id=$1`,
          [a.challengeId],
        )
      ).rows[0].consumed_at,
    ).toBeNull();
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
