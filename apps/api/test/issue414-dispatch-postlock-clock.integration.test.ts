import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createDeclineTaskCommandExecutor } from "../src/modules/dispatch/decline-task-command";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("issue414_postlock");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function proveBlockedSql(queryFragment: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const waiting = await context.adminPool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname=current_database() AND wait_event_type='Lock'
           AND query LIKE $1
       ) AS blocked`,
      [`%${queryFragment}%`],
    );
    if (waiting.rows[0]?.blocked) return;
    await context.adminPool.query("SELECT pg_sleep(0.01)");
  }
  throw new Error("Real PostgreSQL row-lock contention not observed.");
}

async function lockedOperation<T>(
  lockSql: string,
  lockId: string,
  commandSqlFragment: string,
  operation: () => Promise<T>,
): Promise<{ readonly result: T; readonly releasedAt: Date }> {
  const blocker = await context.adminPool.connect();
  await blocker.query("BEGIN");
  let held = true;
  try {
    await blocker.query(lockSql, [lockId]);
    const pending = operation();
    await proveBlockedSql(commandSqlFragment);
    await context.adminPool.query("SELECT pg_sleep(0.3)");
    const releasedAt = (
      await blocker.query<{ at: Date }>("SELECT clock_timestamp() AS at")
    ).rows[0]!.at;
    await blocker.query("COMMIT");
    held = false;
    return { result: await pending, releasedAt };
  } finally {
    if (held) await blocker.query("ROLLBACK");
    blocker.release();
  }
}

describe("Issue #414 after-lock queue/requeue clock", () => {
  it("stamps new QUEUED after a blocked ValetSession lock and preserves event/Task time", async () => {
    const fixture = await context.createDispatchFixture();
    const { result: task, releasedAt } = await lockedOperation(
      "SELECT id FROM valet_sessions WHERE id=$1 FOR UPDATE",
      fixture.sessionId,
      "FOR UPDATE OF session",
      () => context.queue(fixture),
    );
    const time = await context.adminPool.query<{
      created_at: Date;
      occurred_at: Date;
    }>(
      `SELECT task.created_at, event.occurred_at FROM tasks AS task
       JOIN dispatch_events AS event ON event.task_id=task.id
       WHERE task.id=$1 AND event.event_type='QUEUED'`,
      [task.taskId],
    );
    expect(time.rows).toHaveLength(1);
    expect(time.rows[0]!.created_at.getTime()).toBeGreaterThanOrEqual(
      releasedAt.getTime() - 1,
    );
    expect(time.rows[0]!.occurred_at).toEqual(time.rows[0]!.created_at);
  });

  it("stamps DECLINED after a blocked Task lock and preserves Task/Audit/Dispatch time", async () => {
    const fixture = await context.createDispatchFixture();
    const queued = await context.queue(fixture);
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: queued.version,
        taskId: queued.taskId,
      },
    );
    const { result: declined, releasedAt } = await lockedOperation(
      "SELECT id FROM tasks WHERE id=$1 FOR UPDATE",
      queued.taskId,
      "FROM tasks WHERE id = $1 FOR UPDATE",
      () =>
        createDeclineTaskCommandExecutor(context.runtimePool)({
          authenticatedUserId: fixture.userId,
          expectedVersion: assigned.version,
          taskId: queued.taskId,
        }),
    );
    expect(declined.version).toBe(3);
    const times = await context.adminPool.query<{
      updated_at: Date;
      audit_at: Date;
      dispatch_at: Date;
    }>(
      `SELECT task.updated_at, audit.occurred_at AS audit_at,
              event.occurred_at AS dispatch_at
       FROM tasks AS task
       JOIN audit_events AS audit ON audit.entity_type='Task'
         AND audit.entity_id=task.id AND audit.event_type='TASK_DECLINED'
       JOIN dispatch_events AS event ON event.task_id=task.id
         AND event.event_type='DECLINED'
       WHERE task.id=$1`,
      [queued.taskId],
    );
    expect(times.rows).toHaveLength(1);
    expect(times.rows[0]!.audit_at.getTime()).toBeGreaterThanOrEqual(
      releasedAt.getTime() - 1,
    );
    expect(times.rows[0]!.audit_at).toEqual(times.rows[0]!.dispatch_at);
    expect(times.rows[0]!.audit_at).toEqual(times.rows[0]!.updated_at);
  });
});
