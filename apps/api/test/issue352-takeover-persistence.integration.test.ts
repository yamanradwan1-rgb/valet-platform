import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

const context = new Issue352TakeoverTestContext("persistence");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue #352 real PostgreSQL persistence contract", () => {
  it("installs the takeover enum, scoped receipt FKs, and immutable triggers", async () => {
    const evidence = await context.adminPool.query<{
      enum_exists: boolean;
      scoped_fks: number;
      protected_triggers: number;
    }>(
      `SELECT
         EXISTS (SELECT 1 FROM pg_type AS typ
           JOIN pg_enum AS value ON value.enumtypid = typ.oid
           WHERE typ.typname = 'dispatch_event_type'
             AND value.enumlabel = 'EMERGENCY_TAKEOVER') AS enum_exists,
         (SELECT count(*)::int FROM pg_constraint
           WHERE conrelid = 'emergency_task_takeover_operations'::regclass
             AND contype = 'f' AND convalidated) AS scoped_fks,
         (SELECT count(*)::int FROM pg_trigger
           WHERE tgname IN ('issue352_tracking_owner_immutable',
                            'issue352_takeover_receipt_immutable')
             AND tgenabled = 'O') AS protected_triggers`,
    );
    expect(evidence.rows[0]).toEqual({
      enum_exists: true,
      scoped_fks: 9,
      protected_triggers: 2,
    });
  });

  it("restricts the runtime role to SELECT/INSERT receipt access", async () => {
    const result = await context.runtimePool.query<{
      can_insert: boolean;
      can_select: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
      can_rewrite_tracking_owner: boolean;
    }>(
      `SELECT
         has_table_privilege(current_user,
           'emergency_task_takeover_operations', 'SELECT') AS can_select,
         has_table_privilege(current_user,
           'emergency_task_takeover_operations', 'INSERT') AS can_insert,
         has_table_privilege(current_user,
           'emergency_task_takeover_operations', 'UPDATE') AS can_update,
         has_table_privilege(current_user,
           'emergency_task_takeover_operations', 'DELETE') AS can_delete,
         has_table_privilege(current_user,
           'emergency_task_takeover_operations', 'TRUNCATE') AS can_truncate,
         has_column_privilege(current_user,
           'task_tracking_sessions', 'assignee_membership_id', 'UPDATE')
           AS can_rewrite_tracking_owner`,
    );
    expect(result.rows[0]).toEqual({
      can_insert: true,
      can_select: true,
      can_update: false,
      can_delete: false,
      can_truncate: false,
      can_rewrite_tracking_owner: false,
    });
  });

  it("keeps a tracking segment's physical actor immutable", async () => {
    const fixture = await context.parking();
    const replacement = await context.addMember(fixture);
    const segmentId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id,
          assignee_membership_id, started_at, ended_at)
       VALUES ($1,$2,$3,$4,$5,$6,
               clock_timestamp() - interval '2 minutes',
               clock_timestamp() - interval '1 minute')`,
      [segmentId, fixture.organizationId, fixture.locationId, fixture.sessionId,
       fixture.taskId, fixture.membershipId],
    );
    await expect(
      context.adminPool.query(
        `UPDATE task_tracking_sessions SET assignee_membership_id = $2
         WHERE id = $1`,
        [segmentId, replacement.membershipId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const persisted = await context.adminPool.query<{ assignee_membership_id: string }>(
      `SELECT assignee_membership_id::text FROM task_tracking_sessions
       WHERE id = $1`,
      [segmentId],
    );
    expect(persisted.rows[0]?.assignee_membership_id).toBe(fixture.membershipId);
  });

  it("rejects an unattributed foreign tracking owner", async () => {
    const fixture = await context.parking();
    await expect(
      context.adminPool.query(
        `INSERT INTO task_tracking_sessions
           (id, organization_id, location_id, valet_session_id, task_id,
            assignee_membership_id, started_at, ended_at)
         VALUES ($1,$2,$3,$4,$5,$6,
                 clock_timestamp() - interval '2 minutes',
                 clock_timestamp() - interval '1 minute')`,
        [randomUUID(), fixture.organizationId, fixture.locationId,
         fixture.sessionId, fixture.taskId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("requires real A/B and a nonblank emergency dispatch reason", async () => {
    const fixture = await context.parking();
    const { initiator, replacement } = await context.actors(fixture);
    await expect(
      context.adminPool.query(
        `INSERT INTO dispatch_events
           (id, organization_id, location_id, task_id, valet_session_id,
            event_type, actor_membership_id, previous_assignee_membership_id,
            new_assignee_membership_id, reason)
         VALUES ($1,$2,$3,$4,$5,'EMERGENCY_TAKEOVER',$6,$7,$8,' ')`,
        [randomUUID(), fixture.organizationId, fixture.locationId,
         fixture.taskId, fixture.sessionId, initiator.membershipId,
         fixture.membershipId, replacement.membershipId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
