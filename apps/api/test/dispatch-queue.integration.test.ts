import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createQueueParkingTaskCommandExecutor } from "../src/modules/dispatch/queue-parking-task-command";
import { createTaskQueueQuery } from "../src/modules/dispatch/task-queue-query";
import {
  DispatchTestContext,
  expectDispatchError,
} from "./dispatch-test-context";

const context = new DispatchTestContext("queue");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005E Parking Task queue", () => {
  it("creates one version-1 QUEUED Parking Task and one queue event", async () => {
    const fixture = await context.createDispatchFixture();
    const task = await context.queue(fixture);
    expect(task).toMatchObject({
      currentAssigneeMembershipId: null,
      sessionId: fixture.sessionId,
      status: "QUEUED",
      taskType: "PARKING",
      version: 1,
    });
    expect(await context.dispatchEvents(task.taskId)).toEqual([
      expect.objectContaining({
        actor_membership_id: fixture.membershipId,
        event_type: "QUEUED",
        new_assignee_membership_id: null,
        previous_assignee_membership_id: null,
      }),
    ]);
  });

  it("returns the active Task on sequential and concurrent retries", async () => {
    const fixture = await context.createDispatchFixture();
    const execute = createQueueParkingTaskCommandExecutor(context.runtimePool);
    const request = {
      authenticatedUserId: fixture.userId,
      sessionId: fixture.sessionId,
    };
    const first = await execute(request);
    const retry = await execute(request);
    const concurrent = await Promise.all([execute(request), execute(request)]);
    expect(retry.taskId).toBe(first.taskId);
    expect(concurrent.map((task) => task.taskId)).toEqual([
      first.taskId,
      first.taskId,
    ]);
    expect(await context.dispatchEvents(first.taskId)).toHaveLength(1);
  });

  it("requires AWAITING_PARKING and current operational eligibility", async () => {
    const wrongState = await context.createDispatchFixture({
      sessionState: "PARKING",
    });
    await expectDispatchError(context.queue(wrongState), "TASK_INVALID_STATE");
    const ended = await context.createDispatchFixture();
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1`,
      [ended.membershipId],
    );
    await expectDispatchError(
      context.queue(ended),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });

  it("rolls back Task creation when queue history fails", async () => {
    const first = await context.createDispatchFixture();
    const duplicate = randomUUID();
    await createQueueParkingTaskCommandExecutor(context.runtimePool, {
      dispatchEventIdFactory: () => duplicate,
    })({ authenticatedUserId: first.userId, sessionId: first.sessionId });
    const second = await context.createDispatchFixture();
    await expect(
      createQueueParkingTaskCommandExecutor(context.runtimePool, {
        dispatchEventIdFactory: () => duplicate,
      })({ authenticatedUserId: second.userId, sessionId: second.sessionId }),
    ).rejects.toMatchObject({ code: "23505" });
    const tasks = await context.adminPool.query(
      `SELECT id FROM tasks WHERE valet_session_id = $1`,
      [second.sessionId],
    );
    expect(tasks.rows).toHaveLength(0);
  });
});

describe("Location operational Task queue read", () => {
  it("returns same-Location nonterminal Parking and Retrieval projections", async () => {
    const fixture = await context.createDispatchFixture();
    const parking = await context.queue(fixture);
    const retrievalTaskId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type,
          status, version, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED', 1,
               transaction_timestamp())`,
      [
        retrievalTaskId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
      ],
    );
    const tasks = await createTaskQueueQuery(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(tasks.map((task) => task.taskType).sort()).toEqual([
      "PARKING",
      "RETRIEVAL",
    ]);
    expect(tasks).toContainEqual(
      expect.objectContaining({
        ...parking,
        parkingSpot: null,
        parkingZone: null,
        retrievalRequestedAt: null,
      }),
    );
    expect(tasks).toContainEqual(
      expect.objectContaining({
        taskId: retrievalTaskId,
        taskType: "RETRIEVAL",
      }),
    );
    expect(tasks[0]).not.toHaveProperty("keySlotId");
    expect(tasks[0]).not.toHaveProperty("parkingZoneId");
    expect(tasks[0]).not.toHaveProperty("parkingSpotId");
  });

  it("conceals foreign Location and rejects ended-Shift reads", async () => {
    const own = await context.createDispatchFixture();
    const foreign = await context.createDispatchFixture();
    await context.queue(foreign);
    await expectDispatchError(
      createTaskQueueQuery(context.runtimePool)({
        authenticatedUserId: own.userId,
        locationId: foreign.locationId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1`,
      [own.membershipId],
    );
    await expectDispatchError(
      createTaskQueueQuery(context.runtimePool)({
        authenticatedUserId: own.userId,
        locationId: own.locationId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });
});
