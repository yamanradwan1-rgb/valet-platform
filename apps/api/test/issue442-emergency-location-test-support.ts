import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

import { expect } from "vitest";

import type {
  Issue442LocationTestContext,
  RaceFixture,
} from "./issue442-emergency-location-fixture";

export function createIssue442RaceSupport(
  context: Issue442LocationTestContext,
) {
  type HttpResult = Awaited<ReturnType<typeof context.staffPost>>;

  const emergency = (f: RaceFixture): Promise<HttpResult> =>
    context.staffPost(
      f.adminToken,
      `/v1/staff/tasks/${f.taskId}/emergency-takeover`,
      f.transfer,
    );

  const stop = (f: RaceFixture): Promise<HttpResult> =>
    context.staffPost(
      f.adminToken,
      `/v1/staff/management/organizations/${f.organizationId}/locations/${f.locationId}/stop-intake`,
      f.stop,
    );

  async function blockedBy(
    blocker: number,
    exclude: number[] = [],
  ): Promise<number> {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const result = await context.adminPool.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
       WHERE datname=current_database() AND pid<>pg_backend_pid()
         AND $1::integer=ANY(pg_blocking_pids(pid))
         AND NOT (pid=ANY($2::integer[])) ORDER BY pid LIMIT 1`,
        [blocker, exclude],
      );
      if (result.rows[0]) return result.rows[0].pid;
      await pause(20);
    }
    throw new Error(
      `Expected a real PostgreSQL waiter blocked by PID ${blocker}.`,
    );
  }

  async function deadlocks(): Promise<number> {
    await context.adminPool.query("SELECT pg_stat_clear_snapshot()");
    const result = await context.adminPool.query<{ deadlocks: string }>(
      "SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()",
    );
    return Number(result.rows[0]?.deadlocks ?? "0");
  }

  async function assertNoDeadlocks(before: number): Promise<void> {
    let maximum = before;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      maximum = Math.max(maximum, await deadlocks());
      await pause(50);
    }
    expect(maximum - before).toBe(0);
  }

  async function verifyCommitted(
    f: RaceFixture,
    transfer: HttpResult,
    stopped: HttpResult,
  ) {
    expect(transfer).toMatchObject({
      status: 200,
      body: {
        operationId: f.transfer.operationId,
        replayed: false,
        task: {
          assigneeMembershipId: f.newOwner,
          version: f.initialTaskVersion + 1,
        },
        sessionVersion: f.initialSessionVersion + 1,
      },
    });
    expect(stopped).toMatchObject({
      status: 201,
      body: { acceptingIntake: false },
    });
    const persisted = await context.adminPool.query<{
      accepting_intake: boolean;
      location_status: string;
      request_status: string;
      session_state: string;
      session_version: number;
      task_owner: string;
      task_status: string;
      task_version: number;
    }>(
      `SELECT task.status::text AS task_status, task.version AS task_version,
            task.current_assignee_membership_id::text AS task_owner,
            session.state::text AS session_state,session.version AS session_version,
            request.status::text AS request_status,
            location.accepting_intake,location.status::text AS location_status
     FROM tasks AS task
     JOIN valet_sessions AS session ON session.id=task.valet_session_id
     JOIN retrieval_requests AS request ON request.valet_session_id=session.id
       AND request.status='ACCEPTED'
     JOIN locations AS location ON location.id=session.location_id
     WHERE task.id=$1`,
      [f.taskId],
    );
    expect(persisted.rows).toEqual([
      {
        accepting_intake: false,
        location_status: "ACTIVE",
        request_status: "ACCEPTED",
        session_state: "RETRIEVING",
        session_version: f.initialSessionVersion + 1,
        task_owner: f.newOwner,
        task_status: "IN_PROGRESS",
        task_version: f.initialTaskVersion + 1,
      },
    ]);
    const evidence = await context.adminPool.query<{
      audit_count: number;
      dispatch_count: number;
      location_count: number;
      receipt_count: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM dispatch_events WHERE task_id=$1
         AND event_type='EMERGENCY_TAKEOVER' AND previous_assignee_membership_id=$3
         AND new_assignee_membership_id=$4) AS dispatch_count,
       (SELECT count(*)::int FROM audit_events WHERE entity_type='Task'
         AND entity_id=$1 AND event_type='TASK_EMERGENCY_TAKEOVER'
         AND metadata_json->>'operationId'=$2::text) AS audit_count,
       (SELECT count(*)::int FROM emergency_task_takeover_operations
         WHERE task_id=$1 AND operation_id=($2::text)::uuid) AS receipt_count,
       (SELECT count(*)::int FROM audit_events WHERE location_id=$5
         AND event_type='LOCATION_INTAKE_STOPPED') AS location_count`,
      [
        f.taskId,
        f.transfer.operationId,
        f.initialOwner,
        f.newOwner,
        f.locationId,
      ],
    );
    expect(evidence.rows).toEqual([
      {
        audit_count: 1,
        dispatch_count: 1,
        location_count: 1,
        receipt_count: 1,
      },
    ]);

    const replay = await emergency(f);
    expect(replay).toMatchObject({
      status: 200,
      body: { replayed: true, operationId: f.transfer.operationId },
    });
    const retryStop = await stop(f);
    expect(retryStop.status).toBe(201);
    expect(retryStop.body.updatedAt).toBe(stopped.body.updatedAt);
    const denied = await context.staffPost(
      f.adminToken,
      `/v1/staff/tasks/${f.taskId}/emergency-takeover`,
      {
        ...f.transfer,
        operationId: randomUUID(),
        expectedVersion: f.initialTaskVersion,
      },
    );
    expect(denied).toMatchObject({
      status: 409,
      body: { code: "VERSION_CONFLICT" },
    });
    expect(
      (
        await context.adminPool.query(
          `SELECT count(*)::int AS count FROM dispatch_events
     WHERE task_id=$1 AND event_type='EMERGENCY_TAKEOVER'`,
          [f.taskId],
        )
      ).rows[0].count,
    ).toBe(1);
  }

  return {
    emergency,
    stop,
    blockedBy,
    deadlocks,
    assertNoDeadlocks,
    verifyCommitted,
  };
}
