import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { rankEligibleTaskAssignees } from "../src/modules/dispatch/assignment-ranking";
import { inDispatchTransaction } from "../src/modules/dispatch/dispatch-transaction";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  DispatchTestContext,
  expectDispatchError,
} from "./dispatch-test-context";

const context = new DispatchTestContext("ranking_shift");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function insertOwnedTask(
  fixture: Awaited<ReturnType<DispatchTestContext["createDispatchFixture"]>>,
  membershipId: string,
  status: "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS",
) {
  const sessionId = await context.addSession(fixture);
  await context.adminPool.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type,
        status, current_assignee_membership_id, version, updated_at)
     VALUES ($1, $2, $3, $4, 'PARKING', $5, $6, 1,
             transaction_timestamp())`,
    [
      randomUUID(),
      fixture.organizationId,
      fixture.locationId,
      sessionId,
      status,
      membershipId,
    ],
  );
}

describe("VAL-005E deterministic basic assignment", () => {
  it("ranks lower canonical open load first with stable UUID tie-break", async () => {
    const fixture = await context.createDispatchFixture({
      role: "VALET_SUPERVISOR",
    });
    const first = await context.addMember(fixture);
    const second = await context.addMember(fixture);
    await insertOwnedTask(fixture, first.membershipId, "ASSIGNED");
    const ranked = await inDispatchTransaction(context.runtimePool, (tx) =>
      rankEligibleTaskAssignees(tx, {
        locationId: fixture.locationId,
        organizationId: fixture.organizationId,
      }),
    );
    const zeroLoad = ranked.filter((entry) => entry.openTaskLoad === 0);
    expect(zeroLoad.map((entry) => entry.membershipId)).toEqual(
      [...zeroLoad.map((entry) => entry.membershipId)].sort(),
    );
    expect(
      ranked.findIndex((entry) => entry.membershipId === first.membershipId),
    ).toBeGreaterThan(
      ranked.findIndex((entry) => entry.membershipId === second.membershipId),
    );
  });

  it("ignores QUEUED load and automatic assignment needs no proximity data", async () => {
    const fixture = await context.createDispatchFixture({
      role: "VALET_SUPERVISOR",
    });
    const queued = await context.queue(fixture);
    const result = await createAssignTaskCommandExecutor(context.runtimePool)({
      assignmentMode: "AUTOMATIC",
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: queued.taskId,
    });
    expect(result.status).toBe("ASSIGNED");
    expect(result.currentAssigneeMembershipId).toEqual(expect.any(String));
  });
});

describe("VAL-005E Shift-end canonical open-work guard", () => {
  it.each(["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] as const)(
    "blocks Shift end while the member owns %s work",
    async (status) => {
      const fixture = await context.createDispatchFixture();
      const shift = await context.adminPool.query<{ id: string }>(
        `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
        [fixture.membershipId],
      );
      await insertOwnedTask(fixture, fixture.membershipId, status);
      await expectDispatchError(
        createEndShiftCommandExecutor(context.runtimePool)({
          authenticatedUserId: fixture.userId,
          cashReported: "0",
          shiftId: shift.rows[0]!.id,
        }),
        "OPEN_TASK_HANDOFF_REQUIRED",
      );
      const persisted = await context.adminPool.query<{ status: string }>(
        `SELECT status::text FROM shifts WHERE id = $1`,
        [shift.rows[0]!.id],
      );
      expect(persisted.rows[0]?.status).toBe("ACTIVE");
    },
  );

  it("ends after decline clears canonical ownership", async () => {
    const fixture = await context.createDispatchFixture();
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    const queued = await context.queue(fixture);
    await createAssignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      taskId: queued.taskId,
    });
    const { createDeclineTaskCommandExecutor } =
      await import("../src/modules/dispatch/decline-task-command");
    await createDeclineTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 2,
      taskId: queued.taskId,
    });
    const ended = await createEndShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      cashReported: "0",
      shiftId: shift.rows[0]!.id,
    });
    expect(ended.status).toBe("ENDED");
  });

  it("assignment versus Shift end has only safe outcomes", async () => {
    const fixture = await context.createDispatchFixture();
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    const queued = await context.queue(fixture);
    await Promise.allSettled([
      createAssignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        taskId: queued.taskId,
      }),
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: shift.rows[0]!.id,
      }),
    ]);
    const state = await context.adminPool.query<{
      shift_status: string;
      task_status: string;
    }>(
      `SELECT shift.status::text AS shift_status, task.status::text AS task_status
       FROM shifts AS shift CROSS JOIN tasks AS task
       WHERE shift.id = $1 AND task.id = $2`,
      [shift.rows[0]!.id, queued.taskId],
    );
    expect(state.rows[0]).not.toEqual({
      shift_status: "ENDED",
      task_status: "ASSIGNED",
    });
  });
});
