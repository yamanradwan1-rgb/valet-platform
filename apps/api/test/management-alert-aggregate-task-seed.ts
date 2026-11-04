import type { Pool } from "pg";

interface TaskShape {
  readonly organizationId: string;
  readonly locationId: string;
  readonly workerMembershipId: string;
  readonly eligiblePerReason: number;
  readonly historicalTasks: number;
}

/**
 * Disposable SQL-generated benchmark history, NOT a production Task writer.
 * Uses W7's exact versioned Audit/Dispatch event proof without changing
 * custody, the schema or any operational command.
 */
export async function seedManagementAlertTaskHistory(
  pool: Pool,
  input: TaskShape,
): Promise<{ alt02Id: string; alt03Id: string }> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query(
      `CREATE TEMP TABLE issue414_mixed_tasks (
         seq integer, vehicle_id uuid, session_id uuid,
         task_id uuid, kind text
       ) ON COMMIT DROP`,
    );
    await tx.query(
      `INSERT INTO issue414_mixed_tasks
       SELECT i,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
         CASE WHEN i<=$1::integer THEN 'ALT02'
              WHEN i<=2*$1::integer THEN 'ALT03' ELSE 'HISTORY' END
       FROM generate_series(1,2*$1::integer+$2::integer) AS i`,
      [input.eligiblePerReason, input.historicalTasks],
    );
    await tx.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
       SELECT vehicle_id,$1,'synthetic mixed task',clock_timestamp()
       FROM issue414_mixed_tasks`,
      [input.organizationId],
    );
    await tx.query(
      `INSERT INTO valet_sessions
         (id,organization_id,location_id,vehicle_id,state,
          checked_in_by_membership_id,customer_access_token_hash,
          customer_access_expires_at,updated_at)
       SELECT session_id,$1,$2,vehicle_id,
              CASE WHEN kind='HISTORY' THEN 'PARKED'::valet_session_state
                   ELSE 'AWAITING_PARKING'::valet_session_state END,
              $3,'mixed-task:' || session_id::text,
              clock_timestamp()+interval '1 day',clock_timestamp()
       FROM issue414_mixed_tasks`,
      [input.organizationId, input.locationId, input.workerMembershipId],
    );
    await tx.query(
      `INSERT INTO tasks
         (id,organization_id,location_id,valet_session_id,task_type,
          status,version,created_at,updated_at)
       SELECT task_id,$1,$2,session_id,'PARKING',
              CASE WHEN kind='HISTORY' THEN 'CANCELLED'::task_status
                   ELSE 'QUEUED'::task_status END,
              CASE WHEN kind='ALT02' THEN 1
                   WHEN kind='ALT03' THEN 3 ELSE 2 END,
              CASE WHEN kind='HISTORY'
                   THEN clock_timestamp()::timestamptz(3)-interval '2 hours'
                   ELSE clock_timestamp()::timestamptz(3) END,
              clock_timestamp()
       FROM issue414_mixed_tasks`,
      [input.organizationId, input.locationId],
    );
    await tx.query(
      `INSERT INTO dispatch_events
         (id,organization_id,location_id,task_id,valet_session_id,
          event_type,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'QUEUED',t.created_at
       FROM tasks AS t JOIN issue414_mixed_tasks AS s ON s.task_id=t.id`,
    );
    await tx.query(
      `INSERT INTO dispatch_events
         (id,organization_id,location_id,task_id,valet_session_id,
          event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'ASSIGNED',$1,$1,clock_timestamp()::timestamptz(3)
       FROM tasks AS t JOIN issue414_mixed_tasks AS s ON s.task_id=t.id
       WHERE s.kind='ALT03'`,
      [input.workerMembershipId],
    );
    await tx.query(
      `CREATE TEMP TABLE issue414_mixed_declines ON COMMIT DROP AS
       SELECT task_id,clock_timestamp()::timestamptz(3) AS occurred_at
       FROM issue414_mixed_tasks WHERE kind='ALT03'`,
    );
    await tx.query(
      `INSERT INTO dispatch_events
         (id,organization_id,location_id,task_id,valet_session_id,
          event_type,actor_membership_id,
          previous_assignee_membership_id,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'DECLINED',$1,$1,d.occurred_at
       FROM tasks AS t JOIN issue414_mixed_declines AS d ON d.task_id=t.id`,
      [input.workerMembershipId],
    );
    await tx.query(
      `INSERT INTO audit_events
         (id,organization_id,location_id,valet_session_id,
          actor_membership_id,event_type,entity_type,entity_id,
          metadata_json,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,
              t.valet_session_id,$1::uuid,'TASK_DECLINED','Task',t.id,
              jsonb_build_object(
                'fromVersion',2,'toVersion',3,'fromStatus','ASSIGNED',
                'toStatus','QUEUED','sessionId',t.valet_session_id::text,
                'previousAssigneeMembershipId',$1::uuid::text),d.occurred_at
       FROM tasks AS t JOIN issue414_mixed_declines AS d ON d.task_id=t.id`,
      [input.workerMembershipId],
    );
    await tx.query(
      `INSERT INTO dispatch_events
         (id,organization_id,location_id,task_id,valet_session_id,
          event_type,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'CANCELLED',t.created_at+n.i*interval '1 second'
       FROM issue414_mixed_tasks AS s
       JOIN tasks AS t ON t.id=s.task_id
       CROSS JOIN LATERAL generate_series(1,18) AS n(i)
       WHERE s.kind='HISTORY'`,
    );
    await tx.query(
      `INSERT INTO audit_events
         (id,organization_id,location_id,valet_session_id,
          actor_membership_id,event_type,entity_type,entity_id,
          metadata_json,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,
              t.valet_session_id,$1,'ISSUE414_BENCH_HISTORY','Task',t.id,
              jsonb_build_object('toVersion',0,'historyOrdinal',n.i),
              t.created_at+n.i*interval '1 second'
       FROM issue414_mixed_tasks AS s
       JOIN tasks AS t ON t.id=s.task_id
       CROSS JOIN LATERAL generate_series(1,25) AS n(i)
       WHERE s.kind='HISTORY'`,
      [input.workerMembershipId],
    );
    const ids = await tx.query<{ task_id: string; kind: string }>(
      `SELECT task_id,kind FROM issue414_mixed_tasks
       WHERE kind IN ('ALT02','ALT03') ORDER BY seq`,
    );
    const alt02Id = ids.rows.find((row) => row.kind === "ALT02")?.task_id;
    const alt03Id = ids.rows.find((row) => row.kind === "ALT03")?.task_id;
    if (!alt02Id || !alt03Id)
      throw new Error("Missing mixed Task source fixtures.");
    await tx.query("COMMIT");
    return { alt02Id, alt03Id };
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
