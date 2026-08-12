import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createDeclineTaskCommandExecutor } from "../src/modules/dispatch/decline-task-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import {
  DispatchTestContext,
  expectDispatchError,
} from "./dispatch-test-context";

const context = new DispatchTestContext("lifecycle");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function assignedFixture(
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
) {
  const fixture = await context.createDispatchFixture({ role });
  const queued = await context.queue(fixture);
  const assigned = await createAssignTaskCommandExecutor(context.runtimePool)({
    authenticatedUserId: fixture.userId,
    expectedVersion: 1,
    taskId: queued.taskId,
  });
  return { assigned, fixture };
}

describe("VAL-005E accept and decline", () => {
  it("accepts only by the eligible current assignee", async () => {
    const { assigned, fixture } = await assignedFixture();
    const other = await context.addMember(fixture);
    await expectDispatchError(
      createAcceptTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: other.userId,
        expectedVersion: 2,
        taskId: assigned.taskId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const accepted = await createAcceptTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        taskId: assigned.taskId,
      },
    );
    expect(accepted).toMatchObject({
      currentAssigneeMembershipId: fixture.membershipId,
      status: "ACCEPTED",
      version: 3,
    });
    expect(
      (await context.dispatchEvents(assigned.taskId)).at(-1),
    ).toMatchObject({
      actor_membership_id: fixture.membershipId,
      event_type: "ACCEPTED",
      new_assignee_membership_id: fixture.membershipId,
    });
  });

  it("requires ASSIGNED and current eligibility for acceptance", async () => {
    const { assigned, fixture } = await assignedFixture();
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1`,
      [fixture.membershipId],
    );
    await expectDispatchError(
      createAcceptTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        taskId: assigned.taskId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });

  it("declines only ASSIGNED own work, trims reason, and preserves history", async () => {
    const { assigned, fixture } = await assignedFixture();
    const declined = await createDeclineTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      expectedVersion: 2,
      reason: "  wrong lane  ",
      taskId: assigned.taskId,
    });
    expect(declined).toMatchObject({
      currentAssigneeMembershipId: null,
      status: "QUEUED",
      version: 3,
    });
    expect((await context.dispatchEvents(assigned.taskId)).at(-1)).toEqual(
      expect.objectContaining({
        event_type: "DECLINED",
        new_assignee_membership_id: null,
        previous_assignee_membership_id: fixture.membershipId,
        reason: "wrong lane",
      }),
    );
    await expectDispatchError(
      createDeclineTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 3,
        taskId: assigned.taskId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });
});

describe("VAL-005E supervisor reassignment", () => {
  it.each(["ASSIGNED", "ACCEPTED"] as const)(
    "reassigns %s work while preserving status and recording actor/reason",
    async (status) => {
      const { assigned, fixture } = await assignedFixture("VALET_SUPERVISOR");
      const target = await context.addMember(fixture);
      let version = assigned.version;
      if (status === "ACCEPTED") {
        version = (
          await createAcceptTaskCommandExecutor(context.runtimePool)({
            authenticatedUserId: fixture.userId,
            expectedVersion: version,
            taskId: assigned.taskId,
          })
        ).version;
      }
      const result = await createReassignTaskCommandExecutor(
        context.runtimePool,
      )({
        authenticatedUserId: fixture.userId,
        expectedVersion: version,
        reason: "  shift handoff  ",
        targetAssigneeMembershipId: target.membershipId,
        taskId: assigned.taskId,
      });
      expect(result).toMatchObject({
        currentAssigneeMembershipId: target.membershipId,
        status,
        version: version + 1,
      });
      expect(
        (await context.dispatchEvents(assigned.taskId)).at(-1),
      ).toMatchObject({
        actor_membership_id: fixture.membershipId,
        event_type: "REASSIGNED",
        new_assignee_membership_id: target.membershipId,
        previous_assignee_membership_id: fixture.membershipId,
        reason: "shift handoff",
      });
    },
  );

  it("rejects same assignee, blank reason, and IN_PROGRESS without history", async () => {
    const { assigned, fixture } = await assignedFixture("VALET_SUPERVISOR");
    const execute = createReassignTaskCommandExecutor(context.runtimePool);
    await expectDispatchError(
      execute({
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        reason: "valid",
        targetAssigneeMembershipId: fixture.membershipId,
        taskId: assigned.taskId,
      }),
      "TASK_ASSIGNMENT_CONFLICT",
    );
    await expectDispatchError(
      execute({
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        reason: "   ",
        targetAssigneeMembershipId: (await context.addMember(fixture))
          .membershipId,
        taskId: assigned.taskId,
      }),
      "TASK_REASSIGN_REASON_REQUIRED",
    );
    await context.adminPool.query(
      `UPDATE tasks SET status = 'IN_PROGRESS', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [assigned.taskId],
    );
    await expectDispatchError(
      execute({
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        reason: "valid",
        targetAssigneeMembershipId: (await context.addMember(fixture))
          .membershipId,
        taskId: assigned.taskId,
      }),
      "TASK_INVALID_STATE",
    );
    expect(
      (await context.dispatchEvents(assigned.taskId)).filter(
        (event) => event.event_type === "REASSIGNED",
      ),
    ).toHaveLength(0);
  });
});
