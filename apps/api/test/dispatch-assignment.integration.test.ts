import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createDeclineTaskCommandExecutor } from "../src/modules/dispatch/decline-task-command";
import {
  DispatchTestContext,
  expectDispatchError,
} from "./dispatch-test-context";

const context = new DispatchTestContext("assign");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005E initial Task assignment", () => {
  it("allows employee self-claim with one version/event/audit mutation", async () => {
    const fixture = await context.createDispatchFixture();
    const queued = await context.queue(fixture);
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        taskId: queued.taskId,
      },
    );
    expect(assigned).toMatchObject({
      currentAssigneeMembershipId: fixture.membershipId,
      status: "ASSIGNED",
      version: 2,
    });
    expect(await context.dispatchEvents(queued.taskId)).toEqual([
      expect.objectContaining({ event_type: "QUEUED" }),
      expect.objectContaining({
        actor_membership_id: fixture.membershipId,
        event_type: "ASSIGNED",
        new_assignee_membership_id: fixture.membershipId,
      }),
    ]);
    expect(await context.taskAuditEvents(queued.taskId)).toEqual([
      expect.objectContaining({ event_type: "TASK_ASSIGNED" }),
    ]);
    const custody = await context.adminPool.query<{
      current_assignee_membership_id: string | null;
      key_events: string;
      parking_started_at: Date | null;
      state: string;
    }>(
      `SELECT session.current_assignee_membership_id::text,
              session.parking_started_at, session.state::text,
              count(key_event.id)::text AS key_events
       FROM valet_sessions AS session
       LEFT JOIN key_custody_events AS key_event
         ON key_event.valet_session_id = session.id
       WHERE session.id = $1
       GROUP BY session.id`,
      [fixture.sessionId],
    );
    expect(custody.rows[0]).toEqual({
      current_assignee_membership_id: null,
      key_events: "0",
      parking_started_at: null,
      state: "AWAITING_PARKING",
    });
  });

  it("allows an operational supervisor to assign another eligible member", async () => {
    const fixture = await context.createDispatchFixture({
      role: "VALET_SUPERVISOR",
    });
    const target = await context.addMember(fixture);
    const queued = await context.queue(fixture);
    const result = await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      targetAssigneeMembershipId: target.membershipId,
      taskId: queued.taskId,
    });
    expect(result.currentAssigneeMembershipId).toBe(target.membershipId);
  });

  it("denies employee assignment of another member and manager field authority", async () => {
    const employee = await context.createDispatchFixture();
    const target = await context.addMember(employee);
    const queued = await context.queue(employee);
    await expectDispatchError(
      createAssignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: employee.userId,
        expectedVersion: 1,
        targetAssigneeMembershipId: target.membershipId,
        taskId: queued.taskId,
      }),
      "TASK_ASSIGNMENT_CONFLICT",
    );
    const manager = await context.addMember(
      employee,
      "LOCATION_MANAGER",
      false,
    );
    await context.adminPool.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [
        randomUUID(),
        employee.organizationId,
        employee.locationId,
        manager.membershipId,
      ],
    );
    await expectDispatchError(
      createAssignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: manager.userId,
        expectedVersion: 1,
        taskId: queued.taskId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });

  it.each(["ended Shift", "revoked access"])(
    "rejects an ineligible target with %s",
    async (reason) => {
      const supervisor = await context.createDispatchFixture({
        role: "VALET_SUPERVISOR",
      });
      const target = await context.addMember(supervisor);
      const queued = await context.queue(supervisor);
      if (reason === "ended Shift") {
        await context.adminPool.query(
          `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
           WHERE membership_id = $1`,
          [target.membershipId],
        );
      } else {
        await context.adminPool.query(
          `DELETE FROM membership_location_access WHERE membership_id = $1`,
          [target.membershipId],
        );
      }
      await expectDispatchError(
        createAssignTaskCommandExecutor(context.runtimePool)({
          authenticatedUserId: supervisor.userId,
          expectedVersion: 1,
          targetAssigneeMembershipId: target.membershipId,
          taskId: queued.taskId,
        }),
        "TASK_ASSIGNEE_NOT_ELIGIBLE",
      );
    },
  );

  it("gives stale version precedence over state and target validation", async () => {
    const fixture = await context.createDispatchFixture();
    const queued = await context.queue(fixture);
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: queued.taskId,
    });
    await expectDispatchError(
      createAssignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        targetAssigneeMembershipId: randomUUID(),
        taskId: queued.taskId,
      }),
      "VERSION_CONFLICT",
    );
  });

  it("rolls back Task and Dispatch history when Audit insertion fails", async () => {
    const first = await context.createDispatchFixture();
    const firstTask = await context.queue(first);
    const duplicateAuditId = randomUUID();
    await createAssignTaskCommandExecutor(context.runtimePool, {
      auditEventIdFactory: () => duplicateAuditId,
    })({
      authenticatedUserId: first.userId,
      expectedVersion: 1,
      taskId: firstTask.taskId,
    });
    const second = await context.createDispatchFixture();
    const secondTask = await context.queue(second);
    await expect(
      createAssignTaskCommandExecutor(context.runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })({
        authenticatedUserId: second.userId,
        expectedVersion: 1,
        taskId: secondTask.taskId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(
      (await context.dispatchEvents(secondTask.taskId)).map(
        (event) => event.event_type,
      ),
    ).toEqual(["QUEUED"]);
  });

  it("decline makes the same Task claimable again rather than replacing it", async () => {
    const fixture = await context.createDispatchFixture();
    const queued = await context.queue(fixture);
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: queued.taskId,
    });
    const declined = await createDeclineTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      expectedVersion: 2,
      taskId: queued.taskId,
    });
    expect(declined).toMatchObject({
      currentAssigneeMembershipId: null,
      status: "QUEUED",
      taskId: queued.taskId,
      version: 3,
    });
  });
});
