import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";
import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";

describe("DEC-098 forbidden shapes and exact ownership", () => {
  const ctx = new ParkingCancellationTestContext("261_guards");
  beforeAll(() => ctx.setup(), 120_000);
  afterAll(() => ctx.teardown(), 60_000);
  it("does not reinterpret legacy real/falsely-started IN_PROGRESS work or clear physical facts", async () => {
    const { fixture, input } = await ctx.target();
    await ctx.start(fixture, { session: 1, task: 3 });
    const before = await ctx.cancellationFacts(fixture);
    const fresh = {
      ...input,
      expectedSessionVersion: 2,
      expectedTaskVersion: 4,
    };
    await expect(ctx.cancel(fresh)).rejects.toMatchObject({
      code: "TASK_INVALID_STATE",
    });
    expect(await ctx.status(fresh)).toMatchObject({
      outcome: "NOT_CANCELLED",
      classification: "ADVANCED",
    });
    expect(await ctx.cancellationFacts(fixture)).toEqual(before);
  });
  it("fails closed on retained key assignment without fabricating key release", async () => {
    const { fixture, input } = await ctx.target();
    await createAssignKeySlotCommandExecutor(ctx.runtimePool)({
      authenticatedUserId: fixture.userId,
      sessionId: fixture.sessionId,
      expectedVersion: 1,
      keySlotCode: fixture.keySlotCode,
    });
    const before = await ctx.cancellationFacts(fixture);
    await expect(
      ctx.cancel({ ...input, expectedSessionVersion: 2 }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(await ctx.status(input)).toMatchObject({
      outcome: "NOT_CANCELLED",
      classification: "ADVANCED",
    });
    expect(await ctx.cancellationFacts(fixture)).toEqual(before);
  });
  it("does not accept a replacement Shift or administrative role on terminal convergence", async () => {
    const { fixture, input } = await ctx.target();
    await ctx.cancel(input);
    await ctx.adminPool.query(
      "UPDATE shifts SET status='ENDED',ended_at=now() WHERE id=$1",
      [input.expectedShiftId],
    );
    const next = await createStartShiftCommandExecutor(ctx.runtimePool)({
      authenticatedUserId: fixture.userId,
      targetLocationId: fixture.locationId,
    });
    await expect(ctx.status(input)).rejects.toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });
    await expect(
      ctx.status({ ...input, expectedShiftId: next.shiftId }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    for (const role of ["ORG_ADMIN", "LOCATION_MANAGER"]) {
      await ctx.adminPool.query(
        "UPDATE organization_memberships SET role=$2 WHERE id=$1",
        [fixture.membershipId, role],
      );
      await expect(
        ctx.cancel({ ...input, expectedShiftId: next.shiftId }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    }
  });
  it("conceals exact mismatched Task/session pairs in the same Organization and rejects no-Task/DEC-097 targets", async () => {
    const { fixture, input } = await ctx.target();
    const sessionId = await ctx.addSession(fixture);
    const another = await ctx.queue({ ...fixture, sessionId });
    await expect(
      ctx.cancel({ ...input, taskId: another.taskId }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    await expect(
      ctx.status({ ...input, sessionId, taskId: input.taskId }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    await expect(
      ctx.status({ ...input, taskId: randomUUID() }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    await ctx.adminPool.query(
      "UPDATE valet_sessions SET state='CHECKING_IN',checking_in_completed_at=NULL WHERE id=$1",
      [input.sessionId],
    );
    const before = await ctx.cancellationFacts(fixture);
    await expect(ctx.cancel(input)).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
    expect(await ctx.cancellationFacts(fixture)).toEqual(before);
  });
});
