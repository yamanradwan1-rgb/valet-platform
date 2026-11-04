import { randomUUID } from "node:crypto";

import type { ShiftFixture } from "./shift-test-context";
import type { PresenceServerTestContext } from "./shift-presence-server-test-context";

export interface AlertPerfFixture {
  readonly label: "sparse" | "dense";
  readonly fixture: ShiftFixture;
  readonly otherLocationId: string;
  readonly lm: Awaited<ReturnType<PresenceServerTestContext["manager"]>>;
  readonly ca: Awaited<ReturnType<PresenceServerTestContext["manager"]>>;
  readonly expectedLimit: number;
  readonly seeded: {
    readonly activeRetrievals: number;
    readonly historyRetrievals: number;
    readonly activeIncidents: number;
    readonly historyIncidents: number;
    readonly activePresence: number;
    readonly inactivePresence: number;
    readonly terminalPresence: number;
    readonly otherLocationSessions: number;
  };
}

async function createRequester(
  db: PresenceServerTestContext,
  base: ShiftFixture,
) {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'synthetic-benchmark-only','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@perf.vaylet.test`],
  );
  await db.adminPool.query(
    `INSERT INTO organization_memberships
       (id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [membershipId, base.organizationId, userId],
  );
  await db.adminPool.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [base.organizationId, membershipId, base.locationId],
  );
  return { userId, membershipId };
}

async function seedPresence(
  db: PresenceServerTestContext,
  base: ShiftFixture,
  actor: { userId: string; membershipId: string },
  count: number,
  reviewer: { userId: string; membershipId: string },
  status: "PENDING" | "REJECTED",
): Promise<number> {
  if (count === 0) return 0;
  const operations = await db.adminPool.query<{ id: string }>(
    `INSERT INTO shift_presence_operations
      (id,organization_id,location_id,user_id,membership_id,
       operation_id,action,target_fingerprint)
     SELECT gen_random_uuid(),$1,$2,$3,$4,gen_random_uuid(),'START',repeat('a',64)
     FROM generate_series(1,$5::int) RETURNING id`,
    [
      base.organizationId,
      base.locationId,
      actor.userId,
      actor.membershipId,
      count,
    ],
  );
  const opIds = operations.rows.map((r) => r.id);
  const challenges = await db.adminPool.query<{ id: string }>(
    `INSERT INTO shift_presence_challenges
      (id,organization_id,location_id,user_id,membership_id,action,operation_row_id)
     SELECT gen_random_uuid(),o.organization_id,o.location_id,o.user_id,
            o.membership_id,o.action,o.id
     FROM shift_presence_operations o WHERE o.id=ANY($1::uuid[])
     RETURNING id`,
    [opIds],
  );
  const exceptionRows = await db.adminPool.query<{ id: string }>(
    `INSERT INTO shift_presence_exceptions
      (id,organization_id,location_id,user_id,membership_id,action,
       challenge_id,reason,expires_at)
     SELECT gen_random_uuid(),c.organization_id,c.location_id,c.user_id,
            c.membership_id,c.action,c.id,'GPS_UNAVAILABLE',c.expires_at
     FROM shift_presence_challenges c WHERE c.id=ANY($1::uuid[])
     RETURNING id`,
    [challenges.rows.map((r) => r.id)],
  );
  if (status === "REJECTED") {
    await db.adminPool.query(
      `UPDATE shift_presence_exceptions
         SET status='REJECTED',revision=revision+1,
             reviewer_user_id=$2,reviewer_membership_id=$3
       WHERE id=ANY($1::uuid[])`,
      [
        exceptionRows.rows.map((r) => r.id),
        reviewer.userId,
        reviewer.membershipId,
      ],
    );
  }
  return exceptionRows.rowCount ?? 0;
}

async function seedSessions(
  db: PresenceServerTestContext,
  base: ShiftFixture,
  locationId: string,
  active: number,
  history: number,
): Promise<string[]> {
  const count = active + history;
  if (count === 0) return [];
  const vehicles = await db.adminPool.query<{ id: string }>(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     SELECT gen_random_uuid(),$1,'synthetic benchmark',clock_timestamp()
     FROM generate_series(1,$2::int) RETURNING id`,
    [base.organizationId, count],
  );
  const sessions = await db.adminPool.query<{ id: string }>(
    `INSERT INTO valet_sessions
      (id,customer_access_token_hash,customer_access_expires_at,
       organization_id,location_id,vehicle_id,state,
       checked_in_by_membership_id,retrieval_requested_at,created_at,updated_at)
     SELECT gen_random_uuid(),gen_random_uuid()::text,
       clock_timestamp()+interval '1 day',$1,$2,v.id,
       CASE WHEN v.n<=$4 THEN 'REQUESTED'::valet_session_state
         ELSE 'PARKED'::valet_session_state END,
       $3,CASE WHEN v.n<=$4 THEN clock_timestamp()-interval '10 minutes'
         ELSE clock_timestamp()-interval '1 minute' END,
       clock_timestamp(),clock_timestamp()
     FROM (SELECT id,row_number() OVER (ORDER BY id) AS n
           FROM unnest($5::uuid[]) AS ids(id)) v
     RETURNING id`,
    [
      base.organizationId,
      locationId,
      base.membershipId,
      active,
      vehicles.rows.map((r) => r.id),
    ],
  );
  const ids = sessions.rows.map((r) => r.id);
  await db.adminPool.query(
    `INSERT INTO retrieval_requests
       (id,organization_id,valet_session_id,requested_by_type,
        requested_by_membership_id,status,requested_at,cancelled_at)
     SELECT gen_random_uuid(),s.organization_id,s.id,'STAFF',$2,
       CASE WHEN s.state='REQUESTED' THEN 'OPEN'::retrieval_request_status
         ELSE 'CANCELLED'::retrieval_request_status END,
       s.retrieval_requested_at,
       CASE WHEN s.state='PARKED' THEN clock_timestamp() ELSE NULL END
     FROM valet_sessions s WHERE s.id=ANY($1::uuid[])`,
    [ids, base.membershipId],
  );
  return ids;
}

async function seedIncidents(
  db: PresenceServerTestContext,
  base: ShiftFixture,
  sessionId: string,
  active: number,
  history: number,
): Promise<void> {
  await db.adminPool.query(
    `INSERT INTO incidents
      (id,organization_id,location_id,valet_session_id,status,severity,type,
       description,reported_by_membership_id,created_at)
     SELECT gen_random_uuid(),$1,$2,$3,
       CASE WHEN series.n<=$4::int THEN 'OPEN'::incident_status
         WHEN series.n<($4::int+$5::int) THEN 'OPEN'::incident_status
         ELSE 'RESOLVED'::incident_status END,
       CASE WHEN series.n<=$4::int THEN 'CRITICAL'::incident_severity
         WHEN series.n<($4::int+$5::int) THEN 'LOW'::incident_severity
         ELSE 'HIGH'::incident_severity END,
       'OTHER','synthetic benchmark',$6,
       CASE WHEN series.n<=$4::int THEN clock_timestamp()-interval '10 days'
         ELSE clock_timestamp() END
     FROM generate_series(1,$4::int+($5::int*2)) series(n)`,
    [
      base.organizationId,
      base.locationId,
      sessionId,
      active,
      history,
      base.membershipId,
    ],
  );
}

export async function buildAlertPerfFixture(
  db: PresenceServerTestContext,
  label: "sparse" | "dense",
): Promise<AlertPerfFixture> {
  const dense = label === "dense";
  const base = await db.createFixture();
  const lm = await db.manager(base, "LOCATION_MANAGER");
  const ca = await db.manager(base, "ORG_ADMIN");
  const otherLocationId = await db.addLocation(base);
  const active = dense ? 42 : 2;
  const history = dense ? 600 : 2;
  const otherLocationSessions = dense ? 280 : 1;
  await db.adminPool.query(
    "UPDATE locations SET sla_target_seconds=30 WHERE organization_id=$1",
    [base.organizationId],
  );
  const sessions = await seedSessions(
    db,
    base,
    base.locationId,
    active,
    history,
  );
  await seedSessions(db, base, otherLocationId, 0, otherLocationSessions);
  await seedIncidents(db, base, sessions[0]!, active, history);
  const revoked = await createRequester(db, base);
  const activePresence = await seedPresence(
    db,
    base,
    base,
    active,
    lm,
    "PENDING",
  );
  const inactivePresence = await seedPresence(
    db,
    base,
    revoked,
    dense ? 300 : 1,
    lm,
    "PENDING",
  );
  await db.adminPool.query(
    "DELETE FROM membership_location_access WHERE membership_id=$1",
    [revoked.membershipId],
  );
  const terminalPresence = await seedPresence(
    db,
    base,
    base,
    dense ? 300 : 1,
    lm,
    "REJECTED",
  );
  await db.adminPool.query(
    "ANALYZE valet_sessions; ANALYZE retrieval_requests; ANALYZE incidents",
  );
  await db.adminPool.query(
    `ANALYZE shift_presence_operations; ANALYZE shift_presence_challenges;
     ANALYZE shift_presence_exceptions; ANALYZE membership_location_access`,
  );
  return {
    label,
    fixture: base,
    lm,
    ca,
    otherLocationId,
    expectedLimit: Math.min(active, 21),
    seeded: {
      activeRetrievals: active,
      historyRetrievals: history,
      activeIncidents: active,
      historyIncidents: history * 2,
      activePresence,
      inactivePresence,
      terminalPresence,
      otherLocationSessions,
    },
  };
}
