import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("mob-008-accept");

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
  return { assigned, fixture };
}

describe("MOB-008 existing self-accept authority gate", () => {
  it("allows one concurrent accepted effect and rejects the stale equivalent", async () => {
    const { assigned, fixture } = await assignedTask();
    const execute = createAcceptTaskCommandExecutor(context.runtimePool);

    const results = await Promise.allSettled([
      execute({
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: assigned.taskId,
      }),
      execute({
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: assigned.taskId,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected")[0],
    ).toMatchObject({
      reason: { code: "VERSION_CONFLICT" },
    });
    expect(
      (await context.dispatchEvents(assigned.taskId)).filter(
        (event) => event.event_type === "ACCEPTED",
      ),
    ).toHaveLength(1);
    expect(
      (await context.taskAuditEvents(assigned.taskId)).filter(
        (event) => event.event_type === "TASK_ACCEPTED",
      ),
    ).toHaveLength(1);
  });

  it("rolls back Task and Dispatch acceptance when its AuditEvent fails", async () => {
    const first = await assignedTask();
    const duplicateAuditId = randomUUID();
    await createAcceptTaskCommandExecutor(context.runtimePool, {
      auditEventIdFactory: () => duplicateAuditId,
    })({
      authenticatedUserId: first.fixture.userId,
      expectedVersion: first.assigned.version,
      taskId: first.assigned.taskId,
    });
    const second = await assignedTask();

    await expect(
      createAcceptTaskCommandExecutor(context.runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })({
        authenticatedUserId: second.fixture.userId,
        expectedVersion: second.assigned.version,
        taskId: second.assigned.taskId,
      }),
    ).rejects.toMatchObject({ code: "23505" });

    const projection = await context.adminPool.query<{
      status: string;
      version: number;
    }>("SELECT status::text, version FROM tasks WHERE id = $1", [
      second.assigned.taskId,
    ]);
    expect(projection.rows[0]).toEqual({ status: "ASSIGNED", version: 2 });
    expect(
      (await context.dispatchEvents(second.assigned.taskId)).map(
        (event) => event.event_type,
      ),
    ).toEqual(["QUEUED", "ASSIGNED"]);
  });

  it("does not change ValetSession, key custody, or Retrieval state", async () => {
    const { assigned, fixture } = await assignedTask();
    await createAcceptTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: assigned.version,
      taskId: assigned.taskId,
    });

    const state = await context.adminPool.query<{
      key_events: string;
      session_state: string;
    }>(
      `SELECT session.state::text AS session_state,
              count(key_event.id)::text AS key_events
       FROM valet_sessions AS session
       LEFT JOIN key_custody_events AS key_event
         ON key_event.valet_session_id = session.id
       WHERE session.id = $1
       GROUP BY session.id`,
      [fixture.sessionId],
    );
    expect(state.rows[0]).toEqual({
      key_events: "0",
      session_state: "AWAITING_PARKING",
    });
    const retrieval = await context.adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM tasks WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL'",
      [fixture.sessionId],
    );
    expect(retrieval.rows[0]?.count).toBe("0");
  });
});
