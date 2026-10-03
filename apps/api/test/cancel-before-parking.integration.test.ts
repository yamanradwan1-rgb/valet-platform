import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";

describe("pre-custody cancellation through runtime PostgreSQL", () => {
  const ctx = new ParkingCancellationTestContext("261_command");
  beforeAll(() => ctx.setup(), 120_000);
  afterAll(() => ctx.teardown(), 60_000);
  it.each(["QUEUED", "ASSIGNED", "ACCEPTED"])(
    "atomically cancels %s with exact history and convergence",
    async (status) => {
      const { fixture, input } = await ctx.target(status);
      const before = await ctx.cancellationFacts(fixture);
      const result = await ctx.cancel(input);
      expect(result).toMatchObject({
        state: "CANCELLED",
        taskStatus: "CANCELLED",
        sessionVersion: 2,
        taskVersion: 4,
        taskId: fixture.taskId,
      });
      expect(await ctx.cancel(input)).toEqual(result);
      expect(await ctx.status(input)).toEqual({
        outcome: "CANCELLED",
        ...result,
      });
      await expect(
        ctx.cancel({ ...input, expectedTaskVersion: 4 }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      const after = await ctx.cancellationFacts(fixture);
      expect(after.session.checking_in_completed_at).toEqual(
        before.session.checking_in_completed_at,
      );
      expect(after.session.customer_access_token_hash).toEqual(
        before.session.customer_access_token_hash,
      );
      expect(after.session.parking_started_at).toBeNull();
      expect(after.task.current_assignee_membership_id).toEqual(
        before.task.current_assignee_membership_id,
      );
      expect(after.history).toHaveLength(1);
      expect(after.dispatch).toHaveLength(1);
      expect(after.history[0].occurred_at).toEqual(
        after.dispatch[0].occurred_at,
      );
      expect(after.history[0].metadata_json).toEqual({
        taskId: input.taskId,
        shiftId: input.expectedShiftId,
        fromSessionState: "AWAITING_PARKING",
        toSessionState: "CANCELLED",
        fromSessionVersion: 1,
        toSessionVersion: 2,
        fromTaskStatus: status,
        toTaskStatus: "CANCELLED",
        fromTaskVersion: 3,
        toTaskVersion: 4,
      });
      await expect(ctx.queue(fixture)).rejects.toMatchObject({
        code: "TASK_INVALID_STATE",
      });
      await expect(
        ctx.start(fixture, { session: 2, task: 4 }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    },
  );
  it.each(["auditEventIdFactory", "dispatchEventIdFactory"])(
    "rolls back both aggregates when %s fails",
    async (key) => {
      const { fixture, input } = await ctx.target();
      const before = await ctx.cancellationFacts(fixture);
      await expect(
        ctx.cancel(input, { [key]: () => "invalid" }),
      ).rejects.toThrow();
      expect(await ctx.cancellationFacts(fixture)).toEqual(before);
      expect(await ctx.status(input)).toMatchObject({
        outcome: "NOT_CANCELLED",
        classification: "PRE_CUSTODY",
      });
    },
  );
  it("checks both CAS tokens and exact Shift before writes", async () => {
    const { fixture, input } = await ctx.target();
    const before = await ctx.cancellationFacts(fixture);
    for (const change of [
      { expectedSessionVersion: 9 },
      { expectedTaskVersion: 9 },
    ])
      await expect(ctx.cancel({ ...input, ...change })).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
    await expect(
      ctx.cancel({ ...input, expectedShiftId: randomUUID() }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    expect(await ctx.cancellationFacts(fixture)).toEqual(before);
  });
  it.each(["QUEUED", "ASSIGNED", "ACCEPTED"])(
    "conceals other employee/supervisor for %s",
    async (status) => {
      const { fixture, input } = await ctx.target(status);
      const before = await ctx.cancellationFacts(fixture);
      for (const role of ["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const) {
        const other = await ctx.addMember(fixture, role);
        const attempt = { ...input, authenticatedUserId: other.userId };
        await expect(ctx.cancel(attempt)).rejects.toMatchObject({
          code: "TASK_NOT_FOUND_OR_FORBIDDEN",
        });
        await expect(ctx.status(attempt)).rejects.toMatchObject({
          code: "TASK_NOT_FOUND_OR_FORBIDDEN",
        });
      }
      expect(await ctx.cancellationFacts(fixture)).toEqual(before);
    },
  );
  it("permits self-owned Supervisor and conceals foreign scope on first/terminal read", async () => {
    const { input } = await ctx.target("ACCEPTED", "VALET_SUPERVISOR");
    const foreign = await ctx.target();
    for (const terminal of [false, true]) {
      if (terminal) await ctx.cancel(input);
      await expect(
        ctx.status({
          ...input,
          authenticatedUserId: foreign.input.authenticatedUserId,
        }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
      await expect(
        ctx.cancel({ ...input, taskId: foreign.input.taskId }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    }
  });
  it("fails closed on terminal rows without coherent history", async () => {
    const { input } = await ctx.target();
    await ctx.adminPool.query(
      "UPDATE valet_sessions SET state='CANCELLED' WHERE id=$1",
      [input.sessionId],
    );
    await ctx.adminPool.query(
      "UPDATE tasks SET status='CANCELLED' WHERE id=$1",
      [input.taskId],
    );
    await expect(ctx.cancel(input)).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
    await expect(ctx.status(input)).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });
});
