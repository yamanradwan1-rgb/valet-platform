import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createInitiateHandoffExecutor } from "../src/modules/retrieval/initiate-handoff-command";
import { MarkReadyTestContext } from "./mark-ready-test-context";

const db = new MarkReadyTestContext("414-p2-postlock");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

async function proveLockWait(fragment: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const probe = await db.adminPool.query<{ blocked: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
       WHERE datname=current_database() AND wait_event_type='Lock'
         AND query LIKE $1) AS blocked`,
      [`%${fragment}%`],
    );
    if (probe.rows[0]?.blocked) return;
    await db.adminPool.query("SELECT pg_sleep(0.01)");
  }
  throw new Error("PostgreSQL did not observe a real phase-entry lock wait.");
}

async function contested<T>(
  table: "tasks" | "valet_sessions",
  id: string,
  command: () => Promise<T>,
): Promise<{ readonly result: T; readonly releasedAt: Date }> {
  const blocker = await db.adminPool.connect();
  await blocker.query("BEGIN");
  let held = true;
  try {
    await blocker.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
    const pending = command();
    await proveLockWait(table === "tasks"
      ? "FROM tasks WHERE id = $1 FOR UPDATE"
      : "FROM valet_sessions WHERE id = $1 FOR UPDATE");
    await db.adminPool.query("SELECT pg_sleep(0.3)");
    const releasedAt = (await blocker.query<{ at: Date }>(
      "SELECT clock_timestamp() AS at",
    )).rows[0]!.at;
    await blocker.query("COMMIT");
    held = false;
    return { result: await pending, releasedAt };
  } finally {
    if (held) await blocker.query("ROLLBACK");
    blocker.release();
  }
}

describe("Issue #414 stage and READY source-time provenance under real row locks", () => {
  it("records ACCEPTED Task/Dispatch/Audit after a contended Task lock", async () => {
    const { fixture, retrieval } = await db.createRetrievalDispatchFixture();
    const assigned = await createAssignTaskCommandExecutor(db.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: retrieval.taskId,
    });
    const { releasedAt } = await contested("tasks", retrieval.taskId, () =>
      createAcceptTaskCommandExecutor(db.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: retrieval.taskId,
      }));
    const actual = await db.adminPool.query<{
      task_at: Date; audit_at: Date; dispatch_at: Date;
    }>(
      `SELECT task.updated_at AS task_at, audit.occurred_at AS audit_at,
              event.occurred_at AS dispatch_at
       FROM tasks task
       JOIN audit_events audit ON audit.entity_id=task.id
         AND audit.event_type='TASK_ACCEPTED'
       JOIN dispatch_events event ON event.task_id=task.id
         AND event.event_type='ACCEPTED'
       WHERE task.id=$1`, [retrieval.taskId],
    );
    expect(actual.rows).toHaveLength(1);
    expect(actual.rows[0]!.task_at.getTime()).toBeGreaterThanOrEqual(
      releasedAt.getTime() - 1);
    expect(actual.rows[0]!.audit_at).toEqual(actual.rows[0]!.task_at);
    expect(actual.rows[0]!.dispatch_at).toEqual(actual.rows[0]!.task_at);
  });

  it("records IN_PROGRESS Session/Task/Dispatch/Audit after Session lock", async () => {
    const fixture = await db.createStartRetrievalFixture();
    const { releasedAt } = await contested("valet_sessions", fixture.sessionId,
      () => db.startRetrieval(fixture));
    const actual = await db.adminPool.query<{
      session_at: Date; task_at: Date; audit_at: Date; dispatch_at: Date;
    }>(
      `SELECT session.retrieval_started_at AS session_at,
              task.updated_at AS task_at, audit.occurred_at AS audit_at,
              event.occurred_at AS dispatch_at
       FROM valet_sessions session
       JOIN tasks task ON task.valet_session_id=session.id AND task.task_type='RETRIEVAL'
       JOIN audit_events audit ON audit.valet_session_id=session.id
         AND audit.event_type='VALET_SESSION_RETRIEVAL_STARTED'
       JOIN dispatch_events event ON event.task_id=task.id
         AND event.event_type='IN_PROGRESS'
       WHERE session.id=$1`, [fixture.sessionId],
    );
    expect(actual.rows).toHaveLength(1);
    expect(actual.rows[0]!.session_at.getTime()).toBeGreaterThanOrEqual(
      releasedAt.getTime() - 1);
    expect(actual.rows[0]!.task_at).toEqual(actual.rows[0]!.session_at);
    expect(actual.rows[0]!.audit_at).toEqual(actual.rows[0]!.session_at);
    expect(actual.rows[0]!.dispatch_at).toEqual(actual.rows[0]!.session_at);
  });

  it("records READY and its Audit after a contended Session lock", async () => {
    const fixture = await db.createMarkReadyFixture();
    const { releasedAt } = await contested("valet_sessions", fixture.sessionId,
      () => db.markReady(fixture));
    const actual = await db.readyEffects(fixture);
    expect(actual.projection.ready_at!.getTime()).toBeGreaterThanOrEqual(
      releasedAt.getTime() - 1);
    expect(actual.audit).toHaveLength(1);
    expect(actual.audit[0]!.occurred_at).toEqual(actual.projection.ready_at);
  });

  it("records HANDOFF_PENDING after a contended Session lock", async () => {
    const fixture = await db.createMarkReadyFixture();
    await db.markReady(fixture);
    const { releasedAt } = await contested("valet_sessions", fixture.sessionId,
      () => createInitiateHandoffExecutor(db.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedSessionVersion: 7,
        sessionId: fixture.sessionId,
      }));
    const actual = await db.adminPool.query<{
      ready_at: Date; handoff_pending_at: Date; audit_at: Date;
    }>(
      `SELECT session.ready_at, session.handoff_pending_at,
              audit.occurred_at AS audit_at
       FROM valet_sessions session
       JOIN audit_events audit ON audit.valet_session_id=session.id
         AND audit.event_type='VALET_SESSION_HANDOFF_INITIATED'
       WHERE session.id=$1`, [fixture.sessionId],
    );
    expect(actual.rows).toHaveLength(1);
    expect(actual.rows[0]!.handoff_pending_at.getTime()).toBeGreaterThanOrEqual(
      releasedAt.getTime() - 1);
    expect(actual.rows[0]!.handoff_pending_at).toEqual(actual.rows[0]!.audit_at);
    expect(actual.rows[0]!.handoff_pending_at.getTime())
      .toBeGreaterThanOrEqual(actual.rows[0]!.ready_at.getTime());
  });
});
