import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PresenceTestContext } from "./shift-presence-test-context.js";
import { backdatePresenceFixture, presenceAllocation, presenceDecision } from "./shift-presence-fixture.js";

const context = new PresenceTestContext();
beforeAll(async () => {
  await context.setup();
  await context.script(["scripts/provision-runtime-role.mjs"]);
}, 120_000);
afterAll(() => context.teardown(), 60_000);

describe("DEC-099 restricted runtime and privileged retention eligibility", () => {
  it("provisions and verifies exactly the presence privileges, idempotently", async () => {
    for (const table of ["zones", "operations", "challenges", "decisions", "exceptions"]) {
      const result = await context.admin.query(`SELECT has_table_privilege($1,$2,'DELETE') AS delete,
        has_table_privilege($1,$2,'UPDATE') AS update, has_table_privilege($1,$2,'TRUNCATE') AS truncate`,
      [context.runtimeRole, `shift_presence_${table}`]);
      expect(result.rows[0]).toEqual({ delete: false, update: false, truncate: false });
      await expect(context.runtime.query(`DELETE FROM shift_presence_${table}`)).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("permits minimal decision insertion, but rejects rewrite and premature owner purge", async () => {
    const f = await context.fixture();
    const d = await presenceDecision(context.runtime, f);
    await expect(context.runtime.query(`UPDATE shift_presence_decisions SET reason='OUTSIDE' WHERE id=$1`, [d.decisionId])).rejects.toMatchObject({ code: "42501" });
    await expect(context.admin.query(`UPDATE shift_presence_decisions SET decided_at=now() WHERE id=$1`, [d.decisionId])).rejects.toMatchObject({ code: "23514" });
    await expect(context.admin.query(`DELETE FROM shift_presence_decisions WHERE id=$1`, [d.decisionId])).rejects.toMatchObject({ code: "23514" });
    await expect(context.runtime.query(`UPDATE shift_presence_challenges SET user_id=$2 WHERE id=$1`, [d.challengeId, randomUUID()])).rejects.toMatchObject({ code: "42501" });
    await expect(context.runtime.query(`UPDATE shift_presence_challenges SET consumed_at=NULL,decision_id=NULL WHERE id=$1`, [d.challengeId])).rejects.toMatchObject({ code: "23514" });
    const row = (await context.runtime.query(`SELECT * FROM shift_presence_decisions WHERE id=$1`, [d.decisionId])).rows[0];
    expect(row).not.toHaveProperty("latitude");
    expect(row).not.toHaveProperty("longitude");
    expect(row).not.toHaveProperty("metadata_json");
  });
  it("purges consumed challenge and 90-day operation independently of 24-month decision history", async () => {
    const f = await context.fixture();
    const d = await presenceDecision(context.runtime, f);
    await context.admin.query(`DELETE FROM shift_presence_challenges WHERE id=$1`, [d.challengeId]);
    await backdatePresenceFixture(context.admin, "shift_presence_operations", d.operationRowId, "91 days");
    await context.admin.query(`DELETE FROM shift_presence_operations WHERE id=$1`, [d.operationRowId]);
    expect((await context.runtime.query(`SELECT operation_id,challenge_id FROM shift_presence_decisions WHERE id=$1`, [d.decisionId])).rows[0]).toEqual({ operation_id: d.operationId, challenge_id: d.challengeId });
    await backdatePresenceFixture(context.admin, "shift_presence_decisions", d.decisionId, "24 months 1 second");
    expect((await context.admin.query(`DELETE FROM shift_presence_decisions WHERE id=$1`, [d.decisionId])).rowCount).toBe(1);
  });
  it("guards unconsumed challenge cleanup and tombstone deletion at their separate deadlines", async () => {
    const f = await context.fixture();
    const a = await presenceAllocation(context.runtime, f);
    await expect(context.admin.query(`DELETE FROM shift_presence_challenges WHERE id=$1`, [a.challengeId])).rejects.toMatchObject({ code: "23514" });
    await backdatePresenceFixture(context.admin, "shift_presence_challenges", a.challengeId, "23 hours");
    await expect(context.admin.query(`DELETE FROM shift_presence_challenges WHERE id=$1`, [a.challengeId])).rejects.toMatchObject({ code: "23514" });
    await backdatePresenceFixture(context.admin, "shift_presence_challenges", a.challengeId, "25 hours");
    await context.admin.query(`DELETE FROM shift_presence_challenges WHERE id=$1`, [a.challengeId]);
    await backdatePresenceFixture(context.admin, "shift_presence_operations", a.operationRowId, "89 days");
    await expect(context.admin.query(`DELETE FROM shift_presence_operations WHERE id=$1`, [a.operationRowId])).rejects.toMatchObject({ code: "23514" });
    await backdatePresenceFixture(context.admin, "shift_presence_operations", a.operationRowId, "90 days 1 second");
    expect((await context.admin.query(`DELETE FROM shift_presence_operations WHERE id=$1`, [a.operationRowId])).rowCount).toBe(1);
  });
  it("rejects exception scope substitution and self-approval across the same User", async () => {
    const f = await context.fixture();
    const other = await context.fixture();
    const a = await presenceAllocation(context.runtime, f);
    const id = randomUUID();
    const insert = (location: string) => context.runtime.query(`INSERT INTO shift_presence_exceptions
      (id,organization_id,location_id,user_id,membership_id,action,challenge_id,reason,expires_at)
      VALUES ($1,$2,$3,$4,$5,'START',$6,'GPS_UNAVAILABLE',clock_timestamp()+interval '300 seconds')`,
    [id, f.organizationId, location, f.userId, f.membershipId, a.challengeId]);
    await expect(insert(other.locationId)).rejects.toMatchObject({ code: "23514" });
    await insert(f.locationId);
    await expect(context.runtime.query(`UPDATE shift_presence_exceptions SET status='APPROVED',revision=revision+1,
      reviewed_at=clock_timestamp(),reviewer_membership_id=$2,reviewer_user_id=$3 WHERE id=$1`,
    [id, f.membershipId, f.userId])).rejects.toMatchObject({ code: "23514" });
    await expect(context.runtime.query(`UPDATE shift_presence_exceptions SET location_id=$2 WHERE id=$1`, [id, other.locationId])).rejects.toMatchObject({ code: "42501" });
  });
  it("retains terminal exception history for 24 months independently of ephemeral records", async () => {
    const f = await context.fixture();
    const reviewer = await context.fixture();
    const a = await presenceAllocation(context.runtime, f);
    const id = randomUUID();
    await context.runtime.query(`INSERT INTO shift_presence_exceptions
      (id,organization_id,location_id,user_id,membership_id,action,challenge_id,reason,expires_at)
      VALUES ($1,$2,$3,$4,$5,'START',$6,'GPS_UNAVAILABLE',now()+interval '300 seconds')`,
    [id, f.organizationId, f.locationId, f.userId, f.membershipId, a.challengeId]);
    const reject = (membership: string) => context.runtime.query(`UPDATE shift_presence_exceptions
      SET status='REJECTED',revision=revision+1,reviewed_at=clock_timestamp(),
        reviewer_user_id=$2,reviewer_membership_id=$3 WHERE id=$1`, [id, reviewer.userId, membership]);
    await expect(reject(reviewer.membershipId)).rejects.toMatchObject({ code: "23503" });
    const reviewerMembership = randomUUID();
    await context.admin.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
      VALUES ($1,$2,$3,'ORG_ADMIN','ACTIVE',now())`, [reviewerMembership, f.organizationId, reviewer.userId]);
    await reject(reviewerMembership);
    await expect(context.runtime.query(`UPDATE shift_presence_exceptions SET status='PENDING',revision=revision+1 WHERE id=$1`, [id])).rejects.toMatchObject({ code: "23514" });
    await expect(context.admin.query(`DELETE FROM shift_presence_exceptions WHERE id=$1`, [id])).rejects.toMatchObject({ code: "23514" });
    await backdatePresenceFixture(context.admin, "shift_presence_challenges", a.challengeId, "25 hours");
    await context.admin.query(`DELETE FROM shift_presence_challenges WHERE id=$1`, [a.challengeId]);
    await backdatePresenceFixture(context.admin, "shift_presence_operations", a.operationRowId, "91 days");
    await context.admin.query(`DELETE FROM shift_presence_operations WHERE id=$1`, [a.operationRowId]);
    expect((await context.runtime.query(`SELECT challenge_id,status FROM shift_presence_exceptions WHERE id=$1`, [id])).rows[0]).toEqual({ challenge_id: a.challengeId, status: "REJECTED" });
    await backdatePresenceFixture(context.admin, "shift_presence_exceptions", id, "23 months");
    await expect(context.admin.query(`DELETE FROM shift_presence_exceptions WHERE id=$1`, [id])).rejects.toMatchObject({ code: "23514" });
    await backdatePresenceFixture(context.admin, "shift_presence_exceptions", id, "24 months 1 second");
    expect((await context.admin.query(`DELETE FROM shift_presence_exceptions WHERE id=$1`, [id])).rowCount).toBe(1);
  });
  it("requires exact approved exception linkage and consumes it only once", async () => {
    const f = await context.fixture();
    const reviewer = await context.fixture();
    const a = await presenceAllocation(context.runtime, f);
    const exceptionId = randomUUID();
    const decisionId = randomUUID();
    const reviewerMembership = randomUUID();
    await context.admin.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
      VALUES ($1,$2,$3,'ORG_ADMIN','ACTIVE',now())`, [reviewerMembership, f.organizationId, reviewer.userId]);
    await context.runtime.query(`INSERT INTO shift_presence_exceptions
      (id,organization_id,location_id,user_id,membership_id,action,challenge_id,reason,expires_at)
      VALUES ($1,$2,$3,$4,$5,'START',$6,'GPS_UNAVAILABLE',now()+interval '300 seconds')`,
    [exceptionId, f.organizationId, f.locationId, f.userId, f.membershipId, a.challengeId]);
    await context.runtime.query(`UPDATE shift_presence_operations SET request_fingerprint=$2 WHERE id=$1`, [a.operationRowId, "b".repeat(64)]);
    const insertDecision = () => context.runtime.query(`INSERT INTO shift_presence_decisions
      (id,organization_id,location_id,user_id,membership_id,action,operation_id,challenge_id,request_fingerprint,
       policy_fingerprint,applied_mode,company_policy_revision,location_policy_revision,classification,reason,accuracy_band,freshness_band,exception_id)
      VALUES ($1,$2,$3,$4,$5,'START',$6,$7,$8,$9,'OFF',1,1,'MEASUREMENT_UNUSABLE','INVALID_FIX','UNUSABLE','UNUSABLE',$10)`,
    [decisionId, f.organizationId, f.locationId, f.userId, f.membershipId, a.operationId, a.challengeId, "b".repeat(64), "c".repeat(64), exceptionId]);
    await expect(insertDecision()).rejects.toMatchObject({ code: "23514" });
    await context.runtime.query(`UPDATE shift_presence_exceptions SET status='APPROVED',revision=revision+1,
      reviewed_at=clock_timestamp(),reviewer_user_id=$2,reviewer_membership_id=$3 WHERE id=$1 AND revision=1`,
    [exceptionId, reviewer.userId, reviewerMembership]);
    await insertDecision();
    await context.runtime.query(`UPDATE shift_presence_challenges SET consumed_at=clock_timestamp(),decision_id=$2 WHERE id=$1`, [a.challengeId, decisionId]);
    await context.runtime.query(`UPDATE shift_presence_exceptions SET status='CONSUMED',revision=revision+1,
      consumed_decision_id=$2 WHERE id=$1 AND revision=2`, [exceptionId, decisionId]);
    await expect(context.runtime.query(`UPDATE shift_presence_exceptions SET revision=revision+1 WHERE id=$1`, [exceptionId])).rejects.toMatchObject({ code: "23514" });
    expect((await context.runtime.query(`SELECT status,revision,consumed_decision_id FROM shift_presence_exceptions WHERE id=$1`, [exceptionId])).rows[0]).toEqual({ status: "CONSUMED", revision: 3, consumed_decision_id: decisionId });
  });
});
