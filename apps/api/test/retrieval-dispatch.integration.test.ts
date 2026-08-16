import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createDeclineTaskCommandExecutor } from "../src/modules/dispatch/decline-task-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { rankEligibleTaskAssignees } from "../src/modules/dispatch/assignment-ranking";
import { inDispatchTransaction } from "../src/modules/dispatch/dispatch-transaction";
import { createQueueParkingTaskCommandExecutor } from "../src/modules/dispatch/queue-parking-task-command";
import { createTaskQueueQuery } from "../src/modules/dispatch/task-queue-query";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  DispatchTestContext,
  expectDispatchError,
} from "./dispatch-test-context";

const context = new DispatchTestContext("retrieval_dispatch");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const unchangedRetrievalPhysicalState = {
  checked_out: 0,
  request_status: "OPEN",
  retrieval_started_at: null,
  session_state: "REQUESTED",
};

describe("VAL-006C Retrieval Task dispatch composition", () => {
  it("queues, self-claims, accepts, and declines without physical Retrieval effects", async () => {
    const { fixture, retrieval } =
      await context.createRetrievalDispatchFixture();
    const queued = await createTaskQueueQuery(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(queued).toContainEqual(
      expect.objectContaining({
        currentAssigneeMembershipId: null,
        taskId: retrieval.taskId,
        taskType: "RETRIEVAL",
        version: 1,
      }),
    );
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        taskId: retrieval.taskId,
      },
    );
    const accepted = await createAcceptTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: retrieval.taskId,
      },
    );
    expect(accepted).toMatchObject({ status: "ACCEPTED", version: 3 });
    await expectDispatchError(
      createDeclineTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: accepted.version,
        taskId: retrieval.taskId,
      }),
      "TASK_INVALID_STATE",
    );
    const requeued = await context.createRetrievalDispatchFixture();
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: requeued.fixture.userId,
      expectedVersion: 1,
      taskId: requeued.retrieval.taskId,
    });
    const declined = await createDeclineTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: requeued.fixture.userId,
      expectedVersion: 2,
      reason: "  unavailable  ",
      taskId: requeued.retrieval.taskId,
    });
    expect(declined).toMatchObject({
      currentAssigneeMembershipId: null,
      status: "QUEUED",
      version: 3,
    });
    expect(await context.dispatchEvents(requeued.retrieval.taskId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "QUEUED" }),
        expect.objectContaining({
          event_type: "DECLINED",
          reason: "unavailable",
        }),
      ]),
    );
    expect(await context.retrievalPhysicalState(fixture.sessionId)).toEqual(
      unchangedRetrievalPhysicalState,
    );
    expect(
      await context.retrievalPhysicalState(requeued.fixture.sessionId),
    ).toEqual(unchangedRetrievalPhysicalState);
  });

  it("supports supervisor automatic assignment and reassignment across allowed states", async () => {
    const { fixture, retrieval } =
      await context.createRetrievalDispatchFixture("VALET_SUPERVISOR");
    const target = await context.addMember(fixture);
    const supervisorWork = await createQueueParkingTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      sessionId: await context.addSession(fixture),
    });
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: supervisorWork.taskId,
    });
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        assignmentMode: "AUTOMATIC",
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        taskId: retrieval.taskId,
      },
    );
    expect(assigned).toMatchObject({
      currentAssigneeMembershipId: target.membershipId,
      status: "ASSIGNED",
      version: 2,
    });
    const reassigned = await createReassignTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      expectedVersion: 2,
      reason: "shift handoff",
      targetAssigneeMembershipId: fixture.membershipId,
      taskId: retrieval.taskId,
    });
    expect(reassigned).toMatchObject({
      currentAssigneeMembershipId: fixture.membershipId,
      status: "ASSIGNED",
      version: 3,
    });
    const accepted = await createAcceptTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: 3,
        taskId: retrieval.taskId,
      },
    );
    const returned = await createReassignTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      expectedVersion: accepted.version,
      reason: "supervisor takeover",
      targetAssigneeMembershipId: target.membershipId,
      taskId: retrieval.taskId,
    });
    expect(returned).toMatchObject({
      currentAssigneeMembershipId: target.membershipId,
      status: "ACCEPTED",
      version: 5,
    });
    await expectDispatchError(
      createReassignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 5,
        reason: "same person",
        targetAssigneeMembershipId: target.membershipId,
        taskId: retrieval.taskId,
      }),
      "TASK_ASSIGNMENT_CONFLICT",
    );
    await context.adminPool.query(
      `UPDATE tasks SET status = 'IN_PROGRESS', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [retrieval.taskId],
    );
    await expectDispatchError(
      createReassignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 5,
        reason: "in progress handoff",
        targetAssigneeMembershipId: fixture.membershipId,
        taskId: retrieval.taskId,
      }),
      "TASK_INVALID_STATE",
    );
    expect(await context.retrievalPhysicalState(fixture.sessionId)).toEqual(
      unchangedRetrievalPhysicalState,
    );
  });

  it("counts Parking and Retrieval ownership together for ranking and Shift end", async () => {
    const { fixture, retrieval } =
      await context.createRetrievalDispatchFixture("VALET_SUPERVISOR");
    const lowerLoad = await context.addMember(fixture);
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: retrieval.taskId,
    });
    const parking = await createQueueParkingTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      sessionId: await context.addSession(fixture),
    });
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: parking.taskId,
    });
    const ranked = await inDispatchTransaction(context.runtimePool, (tx) =>
      rankEligibleTaskAssignees(tx, {
        locationId: fixture.locationId,
        organizationId: fixture.organizationId,
      }),
    );
    expect(
      ranked.find((entry) => entry.membershipId === fixture.membershipId)
        ?.openTaskLoad,
    ).toBe(2);
    expect(
      ranked.find((entry) => entry.membershipId === lowerLoad.membershipId)
        ?.openTaskLoad,
    ).toBe(0);
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    await expectDispatchError(
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: shift.rows[0]!.id,
      }),
      "OPEN_TASK_HANDOFF_REQUIRED",
    );
    expect(await context.retrievalPhysicalState(fixture.sessionId)).toEqual(
      unchangedRetrievalPhysicalState,
    );
  });

  it("conceals foreign Retrieval Tasks and rejects stale or ineligible mutation", async () => {
    const owner =
      await context.createRetrievalDispatchFixture("VALET_SUPERVISOR");
    const foreign = await context.createRetrievalDispatchFixture();
    await expectDispatchError(
      createAssignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: foreign.fixture.userId,
        expectedVersion: 1,
        taskId: owner.retrieval.taskId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: owner.fixture.userId,
      expectedVersion: 1,
      taskId: owner.retrieval.taskId,
    });
    await expectDispatchError(
      createAcceptTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: owner.fixture.userId,
        expectedVersion: 1,
        taskId: owner.retrieval.taskId,
      }),
      "VERSION_CONFLICT",
    );
    const inactiveTarget = await context.addMember(
      owner.fixture,
      "VALET_EMPLOYEE",
      false,
    );
    await expectDispatchError(
      createReassignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: owner.fixture.userId,
        expectedVersion: 2,
        reason: "coverage",
        targetAssigneeMembershipId: inactiveTarget.membershipId,
        taskId: owner.retrieval.taskId,
      }),
      "TASK_ASSIGNEE_NOT_ELIGIBLE",
    );
    expect(await context.dispatchEvents(owner.retrieval.taskId)).toHaveLength(
      2,
    );
    expect(
      await context.retrievalPhysicalState(owner.fixture.sessionId),
    ).toEqual(unchangedRetrievalPhysicalState);
  });
});
