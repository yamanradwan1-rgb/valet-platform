import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createDeclineTaskCommandExecutor } from "../src/modules/dispatch/decline-task-command";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("issue414_chronology");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function assignedTask() {
  const fixture = await context.createDispatchFixture();
  const queued = await context.queue(fixture);
  const assigned = await createAssignTaskCommandExecutor(context.runtimePool)({
    authenticatedUserId: fixture.userId,
    expectedVersion: queued.version,
    taskId: queued.taskId,
  });
  return { fixture, queued, assigned };
}

interface VersionProof {
  readonly audit_count: number;
  readonly audit_time: Date | null;
  readonly declined_event_count: number;
  readonly queue_event_count: number;
  readonly status: string;
  readonly version: number;
}

async function versionProof(taskId: string): Promise<VersionProof> {
  const result = await context.adminPool.query<VersionProof>(
    `SELECT task.status::text, task.version,
       (SELECT count(*)::integer FROM dispatch_events AS event
        WHERE event.task_id=task.id AND event.event_type='QUEUED')
         AS queue_event_count,
       (SELECT count(*)::integer FROM dispatch_events AS event
        WHERE event.task_id=task.id AND event.event_type='DECLINED')
         AS declined_event_count,
       (SELECT count(*)::integer FROM audit_events AS audit
        WHERE audit.organization_id=task.organization_id
          AND audit.location_id=task.location_id
          AND audit.entity_type='Task' AND audit.entity_id=task.id
          AND audit.event_type='TASK_DECLINED'
          AND audit.metadata_json->>'toVersion'=task.version::text
          AND audit.metadata_json->>'fromVersion'=(task.version-1)::text
          AND audit.metadata_json->>'fromStatus'='ASSIGNED'
          AND audit.metadata_json->>'toStatus'='QUEUED')
         AS audit_count,
       (SELECT min(audit.occurred_at) FROM audit_events AS audit
        WHERE audit.organization_id=task.organization_id
          AND audit.location_id=task.location_id
          AND audit.entity_type='Task' AND audit.entity_id=task.id
          AND audit.event_type='TASK_DECLINED'
          AND audit.metadata_json->>'toVersion'=task.version::text)
         AS audit_time
     FROM tasks AS task WHERE task.id=$1`,
    [taskId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Missing fixture Task.");
  return row;
}

/** Force equal source clocks in actual committed command transactions. */
function withFixedClock(pool: Pool, instant: Date): Pool {
  return new Proxy(pool, {
    get(target, property) {
      if (property !== "connect") {
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async () => {
        const connection = await target.connect();
        return new Proxy(connection, {
          get(client, key) {
            if (key !== "query") {
              const value = Reflect.get(client, key);
              return typeof value === "function" ? value.bind(client) : value;
            }
            return (sql: string, values?: unknown[]) => {
              if (sql.includes("::timestamptz(3) AS operation_time")) {
                return client.query(
                  "SELECT $1::timestamptz AS operation_time",
                  [instant],
                );
              }
              return client.query(sql, values);
            };
          },
        }) as PoolClient;
      };
    },
  }) as Pool;
}

describe("Issue #414 current Queue episode: source chronology investigation", () => {
  it("proves initial queue v1, and latest decline by current Task.version", async () => {
    const { fixture, queued, assigned } = await assignedTask();
    const initial = await versionProof(queued.taskId);
    expect(initial).toMatchObject({
      queue_event_count: 1,
      declined_event_count: 0,
      status: "ASSIGNED",
      version: 2,
    });
    const decline = await createDeclineTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: queued.taskId,
      },
    );
    expect(decline).toMatchObject({ status: "QUEUED", version: 3 });
    expect(await versionProof(queued.taskId)).toMatchObject({
      audit_count: 1,
      declined_event_count: 1,
      queue_event_count: 1,
      status: "QUEUED",
      version: 3,
    });
  });

  it("keeps versions and atomic history coherent with same-ms committed source events", async () => {
    const fixture = await context.createDispatchFixture();
    const queued = await context.queue(fixture);
    const fixed = new Date("2026-11-04T00:00:00.123Z");
    const clockPool = withFixedClock(context.runtimePool, fixed);
    const assign = createAssignTaskCommandExecutor(clockPool);
    const decline = createDeclineTaskCommandExecutor(clockPool);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const version = 1 + cycle * 2;
      await assign({
        authenticatedUserId: fixture.userId,
        expectedVersion: version,
        taskId: queued.taskId,
      });
      await decline({
        authenticatedUserId: fixture.userId,
        expectedVersion: version + 1,
        taskId: queued.taskId,
      });
    }
    const events = await context.adminPool.query<{
      event_type: string;
      occurred_at: Date;
    }>(
      `SELECT event_type::text, occurred_at FROM dispatch_events
       WHERE task_id=$1 AND event_type IN ('ASSIGNED','DECLINED')`,
      [queued.taskId],
    );
    expect(events.rows).toHaveLength(4);
    expect(
      events.rows.every((row) => row.occurred_at.getTime() === fixed.getTime()),
    ).toBe(true);
    expect(await versionProof(queued.taskId)).toMatchObject({
      audit_count: 1,
      declined_event_count: 2,
      status: "QUEUED",
      version: 5,
    });
  });

  it("rolls back Task version and DECLINED dispatch when the audit insert fails", async () => {
    const { fixture, assigned } = await assignedTask();
    const duplicateAuditId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, actor_type, event_type,
          entity_type, entity_id, metadata_json, occurred_at)
       VALUES ($1,$2,$3,$4,$5,'MEMBERSHIP',
               'TEST_DUPLICATE','Task',$6,'{}',clock_timestamp())`,
      [
        duplicateAuditId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
        assigned.taskId,
      ],
    );
    await expect(
      createDeclineTaskCommandExecutor(context.runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })({
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: assigned.taskId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await versionProof(assigned.taskId)).toMatchObject({
      audit_count: 0,
      declined_event_count: 0,
      status: "ASSIGNED",
      version: 2,
    });
  });

  it("serializes same-version racing declines; exactly one versioned audit survives", async () => {
    const { fixture, assigned } = await assignedTask();
    const command = createDeclineTaskCommandExecutor(context.runtimePool);
    const outcomes = await Promise.allSettled([
      command({
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: assigned.taskId,
      }),
      command({
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: assigned.taskId,
      }),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await versionProof(assigned.taskId)).toMatchObject({
      audit_count: 1,
      declined_event_count: 1,
      status: "QUEUED",
      version: 3,
    });
  });
});
