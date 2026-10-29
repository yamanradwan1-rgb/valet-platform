import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import {
  Issue352TakeoverTestContext,
  takeoverTaskId,
} from "./issue352-takeover-test-context";

const context = new Issue352TakeoverTestContext("command");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const execute = () => createEmergencyTakeoverCommandExecutor(context.runtimePool);

describe("Issue #352 real PostgreSQL takeover transitions", () => {
  it("transfers an in-progress Parking Task without fabricating key custody", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const before = await context.snapshot(source.taskId);
    const custodyBefore = await context.custodyHistory(source.sessionId);
    const result = await execute()(request);
    const after = await context.snapshot(source.taskId);

    expect(result).toMatchObject({
      operationId: request.operationId,
      replayed: false,
      task: { id: source.taskId, assigneeMembershipId: replacement.membershipId,
        version: before.task_version + 1, status: "IN_PROGRESS" },
      sessionVersion: before.session_version + 1,
    });
    expect(after).toMatchObject({
      task_assignee: replacement.membershipId,
      session_state: "PARKING",
      task_status: "IN_PROGRESS",
      session_version: before.session_version + 1,
      task_version: before.task_version + 1,
      dispatch_count: before.dispatch_count + 1,
      audit_count: before.audit_count + 1,
    });
    expect(await context.custodyHistory(source.sessionId)).toEqual(custodyBefore);
  });

  it("transfers Retrieval while RETRIEVING without changing request status", async () => {
    const source = await context.retrieving();
    const { initiator, replacement } = await context.actors(source);
    const taskId = takeoverTaskId(source);
    const before = await context.snapshot(taskId);
    await execute()(await context.request(source, initiator, replacement));
    const after = await context.snapshot(taskId);
    expect(before).toMatchObject({ session_state: "RETRIEVING", request_status: "ACCEPTED" });
    expect(after).toMatchObject({ session_state: "RETRIEVING", request_status: "ACCEPTED",
      task_assignee: replacement.membershipId });
    expect(after.custody_count).toBe(before.custody_count);
  });

  it("transfers Retrieval at READY without moving the session backwards", async () => {
    const source = await context.ready();
    const { initiator, replacement } = await context.actors(source);
    const taskId = takeoverTaskId(source);
    const before = await context.snapshot(taskId);
    await execute()(await context.request(source, initiator, replacement));
    const after = await context.snapshot(taskId);
    expect(after).toMatchObject({ session_state: "READY", request_status: "ACCEPTED",
      task_assignee: replacement.membershipId,
      tracking_count: before.tracking_count });
  });

  it("preserves HANDOFF_PENDING and consumes A's Standard proof", async () => {
    const source = await context.verifiedHandoff();
    const { initiator, replacement } = await context.actors(source);
    const taskId = takeoverTaskId(source);
    const before = await context.handoffHistory(source.sessionId);
    expect(before.some((proof) => proof.verified_at && !proof.consumed_at)).toBe(true);
    await execute()(await context.request(source, initiator, replacement));
    const after = await context.handoffHistory(source.sessionId);
    expect(after).toHaveLength(before.length);
    expect(after.every((proof) => proof.consumed_at !== null)).toBe(true);
    expect(after.map((proof) => proof.verified_at)).toEqual(
      before.map((proof) => proof.verified_at),
    );
    expect((await context.snapshot(taskId)).session_state).toBe("HANDOFF_PENDING");
  });

  it("preserves a prior Supervisor override as historical evidence", async () => {
    const { fixture: source } = await context.prepareOverride();
    const { initiator, replacement } = await context.actors(source);
    const before = await context.handoffHistory(source.sessionId);
    await execute()(await context.request(source, initiator, replacement));
    const after = await context.handoffHistory(source.sessionId);
    expect(after).toHaveLength(before.length);
    expect(after.every((proof) => proof.consumed_at !== null)).toBe(true);
    expect((await context.snapshot(takeoverTaskId(source))).session_state)
      .toBe("HANDOFF_PENDING");
  });

  it("rejects an already assigned non-IN_PROGRESS Task with no writes", async () => {
    const source = await context.createStartParkingFixture({ acceptTask: false });
    const { initiator, replacement } = await context.actors(source);
    const before = await context.snapshot(source.taskId);
    await expect(execute()(await context.request(source, initiator, replacement)))
      .rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("rejects a terminal Task and preserves history", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    await context.adminPool.query(
      `UPDATE tasks SET status = 'CANCELLED', updated_at = clock_timestamp()
       WHERE id = $1`, [source.taskId],
    );
    const before = await context.snapshot(source.taskId);
    await expect(execute()(await context.request(source, initiator, replacement)))
      .rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("rejects a stale Task CAS version with zero side effects", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const before = await context.snapshot(source.taskId);
    await expect(execute()({ ...request, expectedVersion: request.expectedVersion - 1 }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("rejects a same-owner target without modifying Task or Session", async () => {
    const source = await context.parking();
    const { initiator } = await context.actors(source);
    const request = await context.request(source, initiator, {
      membershipId: source.membershipId, userId: source.userId,
    });
    const before = await context.snapshot(source.taskId);
    await expect(execute()(request))
      .rejects.toMatchObject({ code: "TASK_ASSIGNMENT_CONFLICT" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("does not relax ordinary Reassign for IN_PROGRESS", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const before = await context.snapshot(source.taskId);
    await expect(createReassignTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: initiator.userId,
      expectedVersion: before.task_version,
      reason: "ordinary transfer is not recovery",
      targetAssigneeMembershipId: replacement.membershipId,
      taskId: source.taskId,
    })).rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("does not duplicate emergency events for an identical operation replay", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const first = await execute()(request);
    const snapshot = await context.snapshot(source.taskId);
    const second = await execute()(request);
    expect(second).toEqual({ ...first, replayed: true });
    expect(await context.snapshot(source.taskId)).toEqual(snapshot);
    const receipt = await context.adminPool.query<{ operation_id: string }>(
      `SELECT operation_id::text FROM emergency_task_takeover_operations
       WHERE operation_id = $1`, [request.operationId],
    );
    expect(receipt.rows).toHaveLength(1);
  });

  it("rejects changed intent under the same operation ID", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    await execute()(request);
    const before = await context.snapshot(source.taskId);
    await expect(execute()({ ...request, reason: "a different reason" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });
});
