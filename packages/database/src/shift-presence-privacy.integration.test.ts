import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PresenceTestContext, type PresenceFixture } from "./shift-presence-test-context.js";
import { backdatePresenceFixture, presenceAllocation, presenceDecision } from "./shift-presence-fixture.js";

const context = new PresenceTestContext();
let legacy: PresenceFixture;
let allocation: Awaited<ReturnType<typeof presenceAllocation>>;
let decisionId: string;
let priorHistory: Record<string, unknown>;
const forbidden = ["request_fingerprint", "target_fingerprint", "latitude", "longitude",
  "captured_at", "accuracy_meters", "distance", "request_payload", "metadata_json"];

beforeAll(() => context.setup(async () => {
  legacy = await context.fixture();
  allocation = await presenceAllocation(context.admin, legacy);
  decisionId = randomUUID();
  await context.admin.query(`UPDATE shift_presence_operations SET request_fingerprint=$2 WHERE id=$1`,
    [allocation.operationRowId, "b".repeat(64)]);
  // Historical migration-058 shape only: migration 059 must erase this existing digest.
  await context.admin.query(`INSERT INTO shift_presence_decisions
    (id,organization_id,location_id,user_id,membership_id,action,shift_id,operation_id,challenge_id,
     request_fingerprint,policy_fingerprint,classification,reason,accuracy_band,freshness_band,
     applied_mode,company_policy_revision,location_policy_revision)
    VALUES ($1,$2,$3,$4,$5,'START',$6,$7,$8,$9,$10,'CONFIDENT_INSIDE','INSIDE','ACCEPTABLE','ACCEPTABLE','OFF',1,1)`,
  [decisionId, legacy.organizationId, legacy.locationId, legacy.userId, legacy.membershipId,
    legacy.shiftId, allocation.operationId, allocation.challengeId, "b".repeat(64), "c".repeat(64)]);
  await context.admin.query(`UPDATE shift_presence_challenges SET consumed_at=clock_timestamp(),decision_id=$2 WHERE id=$1`,
    [allocation.challengeId, decisionId]);
  await context.admin.query(`UPDATE shift_presence_operations SET status='COMMITTED',terminal_at=clock_timestamp(),
    result_shift_id=$2,result_decision_id=$3 WHERE id=$1`, [allocation.operationRowId, legacy.shiftId, decisionId]);
  priorHistory = (await context.admin.query(`SELECT * FROM shift_presence_decisions WHERE id=$1`, [decisionId])).rows[0];
}, "20261004005900"), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("DEC-099 forward Decision privacy correction", () => {
  it("removes an existing Decision digest and preserves every other historical fact", async () => {
    expect(priorHistory.request_fingerprint).toBe("b".repeat(64));
    const { request_fingerprint: removed, ...retained } = priorHistory;
    expect(removed).toBeDefined();
    const history = (await context.runtime.query(`SELECT * FROM shift_presence_decisions WHERE id=$1`, [decisionId])).rows[0];
    expect(history).toEqual(retained);
    for (const column of forbidden) expect(history).not.toHaveProperty(column);
    expect((await context.runtime.query(`SELECT request_fingerprint,status,result_decision_id FROM shift_presence_operations WHERE id=$1`,
      [allocation.operationRowId])).rows[0]).toEqual({ request_fingerprint: "b".repeat(64), status: "COMMITTED", result_decision_id: decisionId });
    await expect(context.runtime.query(`SELECT request_fingerprint FROM shift_presence_decisions`)).rejects.toMatchObject({ code: "42703" });
    await expect(context.admin.query(`UPDATE shift_presence_decisions SET reason='OUTSIDE' WHERE id=$1`, [decisionId])).rejects.toMatchObject({ code: "23514" });
    expect((await context.admin.query(`SELECT count(*)::int AS count FROM _prisma_migrations
      WHERE migration_name='20261004005900_shift_presence_decision_privacy' AND finished_at IS NOT NULL`)).rows[0].count).toBe(1);
  });
  it("retains IDs and historical result after eligible ephemeral purge, with 24-month history protection", async () => {
    await context.admin.query(`DELETE FROM shift_presence_challenges WHERE id=$1`, [allocation.challengeId]);
    await backdatePresenceFixture(context.admin, "shift_presence_operations", allocation.operationRowId, "90 days 1 second");
    await context.admin.query(`DELETE FROM shift_presence_operations WHERE id=$1`, [allocation.operationRowId]);
    const history = (await context.runtime.query(`SELECT * FROM shift_presence_decisions WHERE id=$1`, [decisionId])).rows[0];
    expect(history).toMatchObject({ operation_id: allocation.operationId, challenge_id: allocation.challengeId,
      shift_id: legacy.shiftId, classification: "CONFIDENT_INSIDE", reason: "INSIDE" });
    for (const column of forbidden) expect(history).not.toHaveProperty(column);
    await backdatePresenceFixture(context.admin, "shift_presence_decisions", decisionId, "23 months");
    await expect(context.admin.query(`DELETE FROM shift_presence_decisions WHERE id=$1`, [decisionId])).rejects.toMatchObject({ code: "23514" });
    await backdatePresenceFixture(context.admin, "shift_presence_decisions", decisionId, "24 months 1 second");
    expect((await context.admin.query(`DELETE FROM shift_presence_decisions WHERE id=$1`, [decisionId])).rowCount).toBe(1);
  });
  it("requires a bound attempt and rejects an unrelated result after removing the historical digest", async () => {
    const f = await context.fixture();
    const a = await presenceAllocation(context.runtime, f);
    const insert = () => context.runtime.query(`INSERT INTO shift_presence_decisions
      (id,organization_id,location_id,user_id,membership_id,action,operation_id,challenge_id,
       policy_fingerprint,classification,reason,accuracy_band,freshness_band,applied_mode,company_policy_revision,location_policy_revision)
      VALUES ($1,$2,$3,$4,$5,'START',$6,$7,$8,'CONFIDENT_INSIDE','INSIDE','ACCEPTABLE','ACCEPTABLE','OFF',1,1)`,
    [randomUUID(), f.organizationId, f.locationId, f.userId, f.membershipId, a.operationId, a.challengeId, "c".repeat(64)]);
    await expect(insert()).rejects.toMatchObject({ code: "23514" });
    await context.runtime.query(`UPDATE shift_presence_operations SET request_fingerprint=$2 WHERE id=$1`, [a.operationRowId, "b".repeat(64)]);
    const unrelated = await presenceDecision(context.runtime, f);
    await expect(context.runtime.query(`UPDATE shift_presence_operations SET status='DENIED',terminal_at=clock_timestamp(),
      result_decision_id=$2 WHERE id=$1`, [a.operationRowId, unrelated.decisionId])).rejects.toMatchObject({ code: "23514" });
    await insert();
  });
});
