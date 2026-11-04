import assert from "node:assert/strict";

import type { PoolClient } from "pg";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

export interface Issue414LoadActors {
  readonly locationId: string;
  readonly organizationId: string;
  readonly ca: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly sessionId: string;
  };
  readonly lm: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly sessionId: string;
  };
}

export interface Issue414LoadTaskProbes {
  readonly alt02TaskId: string;
  readonly alt03TaskId: string;
}

export async function issue414CreateAuthorizedLoadActors(
  fixture: ManagementControlPlaneTestFixture,
): Promise<Issue414LoadActors> {
  const caUser = await fixture.createUser();
  const membership = await fixture.createMembership(caUser.id);
  const location = await fixture.addLocation(membership.organizationId);
  // A second Location exists, but is not selected for either bearer.
  await fixture.addLocation(membership.organizationId);
  const ca = await fixture.nativeLogin(caUser);
  await fixture.enrollAndAssure(ca);
  const lmUser = await fixture.createUser();
  const lmMembership = await fixture.addMembership(
    membership.organizationId,
    lmUser.id,
    "LOCATION_MANAGER",
  );
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id,membership_id,location_id) VALUES ($1,$2,$3)`,
    [membership.organizationId, lmMembership, location.locationId],
  );
  const lm = await fixture.nativeLogin(lmUser);
  return {
    organizationId: membership.organizationId,
    locationId: location.locationId,
    ca,
    lm,
  };
}

/** Disposable PG17 SQL-generated mixed Task/Incident workload, not writer E2E. */
export async function issue414SeedAuthorizedHttpLoad(
  fixture: ManagementControlPlaneTestFixture,
  actors: Issue414LoadActors,
): Promise<Issue414LoadTaskProbes> {
  const membership = await fixture.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id=$1 AND user_id=(
       SELECT s.user_id FROM staff_auth_sessions s WHERE s.id=$2
     )`,
    [actors.organizationId, actors.ca.sessionId],
  );
  // Read the CA membership through its real authenticated Staff session,
  // not a guessed or synthetic actor identifier.
  const actorMembershipId = membership.rows[0]?.id;
  assert.ok(actorMembershipId);
  let taskProbes: Issue414LoadTaskProbes | undefined;
  const admin: PoolClient = await fixture.databasePool().connect();
  try {
    await admin.query("BEGIN");
    await admin.query(
      `CREATE TEMP TABLE issue414_http_seed ON COMMIT DROP AS
       SELECT n AS seq, gen_random_uuid() AS vehicle_id,
              gen_random_uuid() AS session_id,
              gen_random_uuid() AS task_id,
              CASE WHEN n<=20 THEN 'ALT02'
                   WHEN n<=40 THEN 'ALT03' ELSE 'OLD' END AS kind
       FROM generate_series(1,200) AS n`,
    );
    await admin.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
       SELECT vehicle_id,$1::uuid,'W7 HTTP load disposable',clock_timestamp()
       FROM issue414_http_seed`,
      [actors.organizationId],
    );
    await admin.query(
      `INSERT INTO valet_sessions(
         id,organization_id,location_id,vehicle_id,state,
         checked_in_by_membership_id,customer_access_token_hash,
         customer_access_expires_at,version,updated_at)
       SELECT session_id,$1::uuid,$2::uuid,vehicle_id,
              CASE WHEN kind='OLD' THEN 'PARKED'::valet_session_state
                   ELSE 'AWAITING_PARKING'::valet_session_state END,
              $3::uuid,'issue414-disposable:'||session_id::text,
              clock_timestamp()+interval '1 day',1,clock_timestamp()
       FROM issue414_http_seed`,
      [actors.organizationId, actors.locationId, actorMembershipId],
    );
    await admin.query(
      `INSERT INTO tasks(
         id,organization_id,location_id,valet_session_id,
         task_type,status,version,created_at,updated_at)
       SELECT task_id,$1::uuid,$2::uuid,session_id,'PARKING',
              CASE WHEN kind='OLD' THEN 'CANCELLED'::task_status
                   ELSE 'QUEUED'::task_status END,
              CASE WHEN kind='ALT02' THEN 1
                   WHEN kind='ALT03' THEN 3 ELSE 2 END,
              clock_timestamp()::timestamptz(3)-interval '10 minutes',
              clock_timestamp()
       FROM issue414_http_seed`,
      [actors.organizationId, actors.locationId],
    );
    await admin.query(
      `INSERT INTO dispatch_events(
         id,organization_id,location_id,task_id,valet_session_id,
         event_type,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'QUEUED',t.created_at
       FROM tasks t JOIN issue414_http_seed s ON s.task_id=t.id`,
    );
    await admin.query(
      `CREATE TEMP TABLE issue414_http_declines ON COMMIT DROP AS
       SELECT task_id,clock_timestamp()::timestamptz(3)-interval '2 minutes'
         AS occurred_at
       FROM issue414_http_seed WHERE kind='ALT03'`,
    );
    await admin.query(
      `INSERT INTO dispatch_events(
         id,organization_id,location_id,task_id,valet_session_id,event_type,
         actor_membership_id,previous_assignee_membership_id,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'DECLINED',$1::uuid,$1::uuid,d.occurred_at
       FROM tasks t JOIN issue414_http_declines d ON d.task_id=t.id`,
      [actorMembershipId],
    );
    await admin.query(
      `INSERT INTO audit_events(
         id,organization_id,location_id,valet_session_id,actor_membership_id,
         event_type,entity_type,entity_id,metadata_json,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,
              t.valet_session_id,$1::uuid,'TASK_DECLINED','Task',t.id,
              jsonb_build_object(
                'fromVersion',2,'toVersion',3,'fromStatus','ASSIGNED',
                'toStatus','QUEUED','sessionId',t.valet_session_id::text,
                'previousAssigneeMembershipId',$1::text),
              d.occurred_at
       FROM tasks t JOIN issue414_http_declines d ON d.task_id=t.id`,
      [actorMembershipId],
    );
    await admin.query(
      `INSERT INTO dispatch_events(
         id,organization_id,location_id,task_id,valet_session_id,
         event_type,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'CANCELLED',t.created_at+n.i*interval '1 second'
       FROM issue414_http_seed s JOIN tasks t ON t.id=s.task_id
       CROSS JOIN LATERAL generate_series(
         1,CASE WHEN s.kind='OLD' THEN 8 ELSE 0 END
       ) AS n(i)`,
    );
    await admin.query(
      `INSERT INTO audit_events(
         id,organization_id,location_id,valet_session_id,actor_membership_id,
         event_type,entity_type,entity_id,metadata_json,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,
              t.valet_session_id,$1::uuid,'W7_HTTP_LOAD_HISTORY','Task',t.id,
              jsonb_build_object('toVersion',2,'historyOrdinal',n.i),
              t.created_at + n.i*interval '1 second'
       FROM issue414_http_seed s JOIN tasks t ON t.id=s.task_id
       CROSS JOIN LATERAL generate_series(1,16) AS n(i)`,
      [actorMembershipId],
    );
    await admin.query(
      `INSERT INTO incidents(
         id,organization_id,location_id,valet_session_id,status,severity,
         type,description,reported_by_membership_id,created_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,
              t.valet_session_id,'OPEN','HIGH','KEY_MISSING',
              'W7 disposable incident', $1::uuid,clock_timestamp()
       FROM issue414_http_seed s JOIN tasks t ON t.id=s.task_id
       WHERE s.seq BETWEEN 1 AND 6`,
      [actorMembershipId],
    );
    const sourceIds = await admin.query<{ kind: string; taskId: string }>(
      `SELECT kind,task_id::text AS "taskId"
       FROM issue414_http_seed WHERE seq IN (1,21) ORDER BY seq`,
    );
    assert.equal(sourceIds.rows[0]?.kind, "ALT02");
    assert.equal(sourceIds.rows[1]?.kind, "ALT03");
    taskProbes = {
      alt02TaskId: sourceIds.rows[0]!.taskId,
      alt03TaskId: sourceIds.rows[1]!.taskId,
    };
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  } finally {
    admin.release();
  }
  for (const table of [
    "tasks",
    "dispatch_events",
    "audit_events",
    "incidents",
    "valet_sessions",
  ]) {
    // Names are fixed allowlisted test-only identifiers, not caller input.
    await fixture.query(`ANALYZE ${table}`);
  }
  assert.ok(taskProbes);
  return taskProbes;
}
