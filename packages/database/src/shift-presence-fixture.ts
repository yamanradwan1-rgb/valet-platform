import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { PresenceFixture } from "./shift-presence-test-context.js";

export async function presenceAllocation(pool: Pool | PoolClient, f: PresenceFixture) {
  const operationRowId = randomUUID();
  const operationId = randomUUID();
  const challengeId = randomUUID();
  await pool.query(`INSERT INTO shift_presence_operations
    (id,organization_id,location_id,user_id,membership_id,operation_id,action,target_fingerprint)
    VALUES ($1,$2,$3,$4,$5,$6,'START',$7)`,
  [operationRowId, f.organizationId, f.locationId, f.userId, f.membershipId, operationId, "a".repeat(64)]);
  await pool.query(`INSERT INTO shift_presence_challenges
    (id,organization_id,location_id,user_id,membership_id,action,operation_row_id)
    VALUES ($1,$2,$3,$4,$5,'START',$6)`, [challengeId, f.organizationId, f.locationId, f.userId, f.membershipId, operationRowId]);
  return { operationRowId, operationId, challengeId };
}

export async function presenceDecision(pool: Pool | PoolClient, f: PresenceFixture) {
  const allocation = await presenceAllocation(pool, f);
  const decisionId = randomUUID();
  await pool.query(`UPDATE shift_presence_operations SET request_fingerprint=$2 WHERE id=$1`, [allocation.operationRowId, "b".repeat(64)]);
  await pool.query(`INSERT INTO shift_presence_decisions
    (id,organization_id,location_id,user_id,membership_id,action,operation_id,challenge_id,
     policy_fingerprint,classification,reason,accuracy_band,freshness_band,applied_mode,company_policy_revision,location_policy_revision)
    VALUES ($1,$2,$3,$4,$5,'START',$6,$7,$8,'CONFIDENT_INSIDE','INSIDE','ACCEPTABLE','ACCEPTABLE','OFF',1,1)`,
  [decisionId, f.organizationId, f.locationId, f.userId, f.membershipId, allocation.operationId, allocation.challengeId, "c".repeat(64)]);
  await pool.query(`UPDATE shift_presence_challenges SET consumed_at=clock_timestamp(),decision_id=$2 WHERE id=$1`, [allocation.challengeId, decisionId]);
  return { ...allocation, decisionId };
}

/** Fixture-only backdating in a disposable owner connection. CHECK/FKs stay enabled. */
export async function backdatePresenceFixture(pool: Pool, table: "shift_presence_decisions" | "shift_presence_challenges" | "shift_presence_operations" | "shift_presence_exceptions", id: string, age: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    const changes = table === "shift_presence_decisions" ? `decided_at=t.at`
      : table === "shift_presence_challenges" ? `issued_at=t.at-interval '300 seconds',expires_at=t.at`
        : table === "shift_presence_operations" ? `created_at=t.at-interval '301 seconds',expires_at=t.at-interval '1 second',
          status=CASE WHEN status='PENDING' THEN 'EXPIRED'::shift_presence_operation_status ELSE status END,terminal_at=t.at`
          : `requested_at=t.at-interval '301 seconds',expires_at=t.at-interval '1 second',reviewed_at=t.at,terminal_at=t.at`;
    await client.query(`WITH t AS MATERIALIZED (SELECT clock_timestamp()-$2::interval AS at)
      UPDATE ${table} SET ${changes} FROM t WHERE id=$1`, [id, age]);
    await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
