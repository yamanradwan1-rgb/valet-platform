import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import {
  DispatchTestContext,
  type DispatchFixture,
} from "../test/dispatch-test-context";

export interface BenchmarkLocation {
  readonly name: "sparse" | "dense";
  readonly organizationId: string;
  readonly locationId: string;
  readonly ca: { readonly userId: string; readonly membershipId: string };
  readonly lm: { readonly userId: string; readonly membershipId: string };
  readonly alt02Id: string;
  readonly alt03Id: string;
  readonly totalTasks: number;
  readonly eligible02: number;
  readonly eligible03: number;
}

interface Shape {
  readonly total: number;
  readonly alt02: number;
  readonly alt03: number;
  readonly historyDispatchPerTask: number;
  readonly historyAuditPerTask: number;
}

/** Synthetic performance-only rows; these are NOT canonical writer events. */
async function seedLocation(
  connection: PoolClient,
  fixture: DispatchFixture,
  locationId: string,
  shape: Shape,
): Promise<{ alt02Id: string; alt03Id: string }> {
  assert.ok(shape.alt02 > 0 && shape.alt03 > 0);
  assert.ok(shape.total > shape.alt02 + shape.alt03);
  await connection.query("BEGIN");
  try {
    await connection.query(`CREATE TEMP TABLE IF NOT EXISTS issue414_w7_seed (
      seq integer PRIMARY KEY, vehicle_id uuid NOT NULL,
      session_id uuid NOT NULL, task_id uuid NOT NULL, kind text NOT NULL
    ) ON COMMIT PRESERVE ROWS`);
    await connection.query("TRUNCATE issue414_w7_seed");
    await connection.query(
      `INSERT INTO issue414_w7_seed
       SELECT i,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
              CASE WHEN i <= $1 THEN 'ALT02'
                   WHEN i <= $1 + $2 THEN 'ALT03' ELSE 'HISTORY' END
       FROM generate_series(1,$3::integer) AS i`,
      [shape.alt02, shape.alt03, shape.total],
    );
    const base = [fixture.organizationId, locationId, fixture.membershipId];
    await connection.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
       SELECT vehicle_id,$1::uuid,'W7 disposable benchmark',clock_timestamp()
       FROM issue414_w7_seed`,
      [fixture.organizationId],
    );
    await connection.query(
      `INSERT INTO valet_sessions(
         id,organization_id,location_id,vehicle_id,state,
         checked_in_by_membership_id,customer_access_token_hash,
         customer_access_expires_at,version,updated_at)
       SELECT session_id,$1::uuid,$2::uuid,vehicle_id,
              CASE WHEN kind='HISTORY' THEN 'PARKED'::valet_session_state
                   ELSE 'AWAITING_PARKING'::valet_session_state END,
              $3::uuid,'w7-disposable:' || session_id::text,
              clock_timestamp() + interval '1 day',1,clock_timestamp()
       FROM issue414_w7_seed`,
      base,
    );
    await connection.query(
      `INSERT INTO tasks(
         id,organization_id,location_id,valet_session_id,task_type,
         status,version,created_at,updated_at)
       SELECT task_id,$1::uuid,$2::uuid,session_id,'PARKING',
              CASE WHEN kind='HISTORY' THEN 'CANCELLED'::task_status
                   ELSE 'QUEUED'::task_status END,
              CASE WHEN kind='ALT02' THEN 1
                   WHEN kind='ALT03' THEN 3 ELSE 2 END,
              clock_timestamp()::timestamptz(3)-interval '10 minutes',
              clock_timestamp()
       FROM issue414_w7_seed`,
      [fixture.organizationId, locationId],
    );
    // The initial queued source witness must match each Task.created_at
    // exactly, even for old/ineligible Tasks.
    await connection.query(
      `INSERT INTO dispatch_events(
         id,organization_id,location_id,task_id,valet_session_id,
         event_type,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'QUEUED',t.created_at
       FROM tasks AS t JOIN issue414_w7_seed AS seed ON seed.task_id=t.id`,
    );
    await connection.query(
      `INSERT INTO dispatch_events(
         id,organization_id,location_id,task_id,valet_session_id,
         event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'ASSIGNED',$1::uuid,$1::uuid,
              clock_timestamp()::timestamptz(3)-interval '3 minutes'
       FROM tasks AS t JOIN issue414_w7_seed AS seed ON seed.task_id=t.id
       WHERE seed.kind='ALT03'`,
      [fixture.membershipId],
    );
    // One identical database timestamp for the paired decline Dispatch/Audit.
    await connection.query(
      `CREATE TEMP TABLE issue414_w7_decline AS
       SELECT seed.task_id,
              (clock_timestamp()::timestamptz(3)-interval '2 minutes')
                AS occurred_at
       FROM issue414_w7_seed AS seed WHERE seed.kind='ALT03'`,
    );
    await connection.query(
      `INSERT INTO dispatch_events(
         id,organization_id,location_id,task_id,valet_session_id,
         event_type,actor_membership_id,
         previous_assignee_membership_id,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'DECLINED',$1::uuid,$1::uuid,d.occurred_at
       FROM tasks AS t JOIN issue414_w7_decline AS d ON d.task_id=t.id`,
      [fixture.membershipId],
    );
    await connection.query(
      `INSERT INTO audit_events(
         id,organization_id,location_id,valet_session_id,
         actor_membership_id,event_type,entity_type,entity_id,
         metadata_json,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,
              t.valet_session_id,$1::uuid,'TASK_DECLINED','Task',t.id,
              jsonb_build_object(
                'fromVersion',2,'toVersion',3,'fromStatus','ASSIGNED',
                'toStatus','QUEUED','sessionId',t.valet_session_id::text,
                'previousAssigneeMembershipId',$1::text),
              d.occurred_at
       FROM tasks AS t JOIN issue414_w7_decline AS d ON d.task_id=t.id`,
      [fixture.membershipId],
    );
    await connection.query("DROP TABLE issue414_w7_decline");
    await connection.query(
      `INSERT INTO dispatch_events(
         id,organization_id,location_id,task_id,valet_session_id,
         event_type,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,t.id,
              t.valet_session_id,'CANCELLED',
              t.created_at + (n.i * interval '1 second')
       FROM issue414_w7_seed AS seed
       JOIN tasks AS t ON t.id=seed.task_id
       CROSS JOIN LATERAL generate_series(
         1,CASE WHEN seed.kind='HISTORY' THEN $1::integer ELSE 0 END
       ) AS n(i)`,
      [shape.historyDispatchPerTask],
    );
    await connection.query(
      `INSERT INTO audit_events(
         id,organization_id,location_id,valet_session_id,
         actor_membership_id,event_type,entity_type,entity_id,
         metadata_json,occurred_at)
       SELECT gen_random_uuid(),t.organization_id,t.location_id,
              t.valet_session_id,$1::uuid,'W7_HISTORY','Task',t.id,
              jsonb_build_object(
                'toVersion',CASE WHEN seed.kind='ALT03' THEN 2 ELSE 0 END,
                'historyOrdinal',n.i),t.created_at + (n.i * interval '1 second')
       FROM issue414_w7_seed AS seed
       JOIN tasks AS t ON t.id=seed.task_id
       CROSS JOIN LATERAL generate_series(1,$2::integer) AS n(i)`,
      [fixture.membershipId, shape.historyAuditPerTask],
    );
    const ids = await connection.query<{ kind: string; task_id: string }>(
      "SELECT kind,task_id FROM issue414_w7_seed WHERE kind IN ('ALT02','ALT03') ORDER BY seq",
    );
    await connection.query("COMMIT");
    const alt02Id = ids.rows.find((row) => row.kind === "ALT02")?.task_id;
    const alt03Id = ids.rows.find((row) => row.kind === "ALT03")?.task_id;
    assert.ok(alt02Id && alt03Id);
    return { alt02Id, alt03Id };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
}

export async function createBenchmarkLocations(
  context: DispatchTestContext,
  denseTotal = 1200,
): Promise<BenchmarkLocation[]> {
  assert.ok(
    Number.isSafeInteger(denseTotal) && denseTotal >= 140 && denseTotal <= 6000,
  );
  const specs: { name: "sparse" | "dense"; target: Shape; neighbor: Shape }[] =
    [
      {
        name: "sparse",
        target: {
          total: 80,
          alt02: 12,
          alt03: 12,
          historyDispatchPerTask: 3,
          historyAuditPerTask: 5,
        },
        neighbor: {
          total: 30,
          alt02: 4,
          alt03: 4,
          historyDispatchPerTask: 3,
          historyAuditPerTask: 5,
        },
      },
      {
        name: "dense",
        target: {
          total: denseTotal,
          alt02: 60,
          alt03: 60,
          historyDispatchPerTask: 18,
          historyAuditPerTask: 25,
        },
        neighbor: {
          total: 300,
          alt02: 20,
          alt03: 20,
          historyDispatchPerTask: 18,
          historyAuditPerTask: 25,
        },
      },
    ];
  const results: BenchmarkLocation[] = [];
  for (const spec of specs) {
    const fixture = await context.createDispatchFixture({ startShift: false });
    const otherLocation = await context.addLocation(fixture);
    const ca = await context.addMember(fixture, "ORG_ADMIN", false);
    const lm = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const admin = await context.adminPool.connect();
    try {
      const primary = await seedLocation(
        admin,
        fixture,
        fixture.locationId,
        spec.target,
      );
      await seedLocation(admin, fixture, otherLocation, spec.neighbor);
      results.push({
        name: spec.name,
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        ca,
        lm,
        ...primary,
        totalTasks: spec.target.total,
        eligible02: spec.target.alt02,
        eligible03: spec.target.alt03,
      });
    } finally {
      admin.release();
    }
  }
  await context.adminPool.query("ANALYZE tasks");
  await context.adminPool.query("ANALYZE dispatch_events");
  await context.adminPool.query("ANALYZE audit_events");
  return results;
}
