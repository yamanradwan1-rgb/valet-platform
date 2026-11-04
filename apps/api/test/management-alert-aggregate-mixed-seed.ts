import { randomUUID } from "node:crypto";
import type { PoolClient, Pool } from "pg";

interface MixedInput {
  readonly organizationId: string;
  readonly locationId: string;
  readonly reporterMembershipId: string;
  readonly ownerUserIds: readonly [string, string];
  readonly eligiblePerFamily: number;
  readonly historicalTasks: number;
}

async function seedActorAndPreferences(tx: PoolClient, input: MixedInput) {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await tx.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'synthetic-aggregate-only','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@issue414.synthetic.test`],
  );
  await tx.query(
    `INSERT INTO organization_memberships
       (id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [membershipId, input.organizationId, userId],
  );
  await tx.query(
    `INSERT INTO membership_location_access
       (organization_id,membership_id,location_id) VALUES($1,$2,$3)`,
    [input.organizationId, membershipId, input.locationId],
  );
  // The default ALT02 60s cannot become eligible after a freshly captured
  // test-only cutover without sleeping. Use accepted per-user zero seconds;
  // these are synthetic fixture rows, not simulated Management API writes.
  await tx.query(
    `INSERT INTO management_alert_timing_preferences
       (organization_id,user_id,alt02_queue_seconds)
     SELECT $1, actor.id, 0 FROM unnest($2::uuid[]) AS actor(id)`,
    [input.organizationId, input.ownerUserIds],
  );
  // DEC-095 snapshots the Location's effective SLA at request creation.
  // A NULL source policy correctly produces NULL snapshot and NO ALT-01.
  await tx.query(
    `UPDATE locations SET sla_target_seconds=30
     WHERE organization_id=$1 AND id=$2`,
    [input.organizationId, input.locationId],
  );
  return { userId, membershipId };
}

async function seedRetrievals(tx: PoolClient, input: MixedInput) {
  await tx.query(
    `CREATE TEMP TABLE issue414_mixed_retrieval (
       vehicle_id uuid, session_id uuid, request_id uuid
     ) ON COMMIT DROP`,
  );
  await tx.query(
    `INSERT INTO issue414_mixed_retrieval
     SELECT gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
     FROM generate_series(1,$1::integer)`,
    [input.eligiblePerFamily],
  );
  await tx.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     SELECT vehicle_id,$1,'synthetic mixed retrieval',clock_timestamp()
     FROM issue414_mixed_retrieval`,
    [input.organizationId],
  );
  await tx.query(
    `INSERT INTO valet_sessions
       (id,organization_id,location_id,vehicle_id,state,
        checked_in_by_membership_id,customer_access_token_hash,
        customer_access_expires_at,retrieval_requested_at,updated_at)
     SELECT session_id,$1,$2,vehicle_id,'REQUESTED',$3,
            'mixed-retrieval:' || session_id::text,
            clock_timestamp() + interval '1 day',
            clock_timestamp() - interval '10 minutes',clock_timestamp()
     FROM issue414_mixed_retrieval`,
    [input.organizationId, input.locationId, input.reporterMembershipId],
  );
  await tx.query(
    `INSERT INTO retrieval_requests
       (id,organization_id,valet_session_id,requested_by_type,
        requested_by_membership_id,status,requested_at,
        sla_target_seconds_snapshot)
     SELECT r.request_id,$1,r.session_id,'STAFF',$2,'OPEN',
            s.retrieval_requested_at,30
     FROM issue414_mixed_retrieval AS r
     JOIN valet_sessions AS s ON s.id=r.session_id`,
    [input.organizationId, input.reporterMembershipId],
  );
}

async function seedPresence(
  tx: PoolClient,
  input: MixedInput,
  requester: { userId: string; membershipId: string },
) {
  const operations = await tx.query<{ id: string }>(
    `INSERT INTO shift_presence_operations
       (id,organization_id,location_id,user_id,membership_id,
        operation_id,action,target_fingerprint)
     SELECT gen_random_uuid(),$1,$2,$3,$4,gen_random_uuid(),
            'START',repeat('a',64)
     FROM generate_series(1,$5::integer) RETURNING id`,
    [
      input.organizationId,
      input.locationId,
      requester.userId,
      requester.membershipId,
      input.eligiblePerFamily,
    ],
  );
  const challenges = await tx.query<{ id: string }>(
    `INSERT INTO shift_presence_challenges
       (id,organization_id,location_id,user_id,membership_id,
        action,operation_row_id)
     SELECT gen_random_uuid(),o.organization_id,o.location_id,o.user_id,
            o.membership_id,o.action,o.id
     FROM shift_presence_operations AS o WHERE o.id=ANY($1::uuid[])
     RETURNING id`,
    [operations.rows.map((row) => row.id)],
  );
  await tx.query(
    `INSERT INTO shift_presence_exceptions
       (id,organization_id,location_id,user_id,membership_id,action,
        challenge_id,reason,expires_at)
     SELECT gen_random_uuid(),c.organization_id,c.location_id,c.user_id,
            c.membership_id,c.action,c.id,'GPS_UNAVAILABLE',c.expires_at
     FROM shift_presence_challenges AS c WHERE c.id=ANY($1::uuid[])`,
    [challenges.rows.map((row) => row.id)],
  );
}

/** Only INSERTs synthetic data into the disposable, owned PG17 child. */
export async function seedManagementAlertMixedSources(
  adminPool: Pool,
  input: MixedInput,
): Promise<{ readonly userId: string; readonly membershipId: string }> {
  const tx = await adminPool.connect();
  try {
    await tx.query("BEGIN");
    const requester = await seedActorAndPreferences(tx, input);
    await seedRetrievals(tx, input);
    await seedPresence(tx, input, requester);
    await tx.query("COMMIT");
    return requester;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
