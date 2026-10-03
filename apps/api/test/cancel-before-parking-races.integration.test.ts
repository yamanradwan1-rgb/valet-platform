import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";
import { cancellationSqlBarrier } from "./cancel-check-in-race-barrier";
import { createCancelBeforeParkingCommandExecutor } from "../src/modules/parking/cancel-before-parking-command";
import { createStartParkingCommandExecutor } from "../src/modules/parking/start-parking-command";
import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";

describe("DEC-098 deterministic real PostgreSQL interleavings", () => {
  const ctx = new ParkingCancellationTestContext("261_races");
  beforeAll(() => ctx.setup(), 120_000);
  afterAll(() => ctx.teardown(), 60_000);
  it("serializes the actual End Shift command against queued cancellation in both winner orders", async () => {
    for (const cancellationFirst of [true, false]) {
      const { fixture, input } = await ctx.target("QUEUED");
      const barrier = cancellationSqlBarrier(ctx.runtimePool, (sql) =>
        sql.includes(cancellationFirst ? "UPDATE tasks" : "UPDATE shifts"),
      );
      const end = (pool: typeof ctx.runtimePool) =>
        createEndShiftCommandExecutor(pool)({
          authenticatedUserId: fixture.userId,
          shiftId: input.expectedShiftId,
          cashReported: "0.000",
        });
      const first = (
        cancellationFirst
          ? createCancelBeforeParkingCommandExecutor(barrier.pool)(input)
          : end(barrier.pool)
      ).catch((e) => e);
      await barrier.entered;
      const second = (
        cancellationFirst ? end(ctx.runtimePool) : ctx.cancel(input)
      ).catch((e) => e);
      try {
        await barrier.proveBlocked(ctx.adminPool);
      } finally {
        barrier.release();
      }
      const results = await Promise.all([first, second]);
      expect(results[cancellationFirst ? 1 : 0]).toMatchObject({
        status: "ENDED",
      });
      const facts = await ctx.cancellationFacts(fixture);
      if (cancellationFirst) {
        expect(results[0]).toMatchObject({
          state: "CANCELLED",
          taskStatus: "CANCELLED",
        });
        expect(facts.history).toHaveLength(1);
      } else {
        expect(results[1]).toHaveProperty(
          "code",
          "TASK_NOT_FOUND_OR_FORBIDDEN",
        );
        expect(facts.session.state).toBe("AWAITING_PARKING");
        expect(facts.task.status).toBe("QUEUED");
        expect(facts.history).toHaveLength(0);
      }
    }
  });
  it.each(["CANCEL", "START", "START_ROLLBACK"])(
    "serializes Start Parking with %s winner",
    async (winner) => {
      const { fixture, input } = await ctx.target();
      const barrier = cancellationSqlBarrier(ctx.runtimePool, (sql) =>
        sql.includes("UPDATE tasks"),
      );
      const startInput = {
        authenticatedUserId: input.authenticatedUserId,
        sessionId: input.sessionId,
        expectedSessionVersion: 1,
        expectedTaskVersion: 3,
      };
      const first = (
        winner === "CANCEL"
          ? createCancelBeforeParkingCommandExecutor(barrier.pool)(input)
          : createStartParkingCommandExecutor(
              barrier.pool,
              winner === "START_ROLLBACK"
                ? { auditEventIdFactory: () => "invalid" }
                : {},
            )(startInput)
      ).catch((e) => e);
      await barrier.entered;
      const second = (
        winner === "CANCEL"
          ? createStartParkingCommandExecutor(ctx.runtimePool)(startInput)
          : ctx.cancel(input)
      ).catch((e) => e);
      try {
        await barrier.proveBlocked(ctx.adminPool);
      } finally {
        barrier.release();
      }
      const results = await Promise.all([first, second]);
      const facts = await ctx.cancellationFacts(fixture);
      if (winner === "START") {
        expect(results[0]).toMatchObject({
          state: "PARKING",
          taskStatus: "IN_PROGRESS",
        });
        expect(results[1]).toHaveProperty("code");
        expect(facts.session.state).toBe("PARKING");
        expect(facts.session.parking_started_at).not.toBeNull();
        expect(facts.history).toHaveLength(0);
        expect((await ctx.status(input)).outcome).toBe("NOT_CANCELLED");
      } else {
        expect(results[winner === "CANCEL" ? 0 : 1]).toMatchObject({
          state: "CANCELLED",
          taskStatus: "CANCELLED",
        });
        expect(facts.session.state).toBe("CANCELLED");
        expect(facts.session.parking_started_at).toBeNull();
        expect(facts.history).toHaveLength(1);
        expect(facts.dispatch).toHaveLength(1);
      }
    },
  );
  it("converges concurrent identical cancellations once, including winner rollback", async () => {
    for (const rollback of [false, true]) {
      const { fixture, input } = await ctx.target();
      const barrier = cancellationSqlBarrier(ctx.runtimePool, (sql) =>
        sql.includes("UPDATE tasks"),
      );
      const first = createCancelBeforeParkingCommandExecutor(
        barrier.pool,
        rollback ? { auditEventIdFactory: () => "invalid" } : {},
      )(input).catch((e) => e);
      await barrier.entered;
      const second = ctx.cancel(input);
      try {
        await barrier.proveBlocked(ctx.adminPool);
      } finally {
        barrier.release();
      }
      const result = await second;
      if (!rollback) expect(await first).toEqual(result);
      else expect(await first).toHaveProperty("code");
      const facts = await ctx.cancellationFacts(fixture);
      expect(facts.history).toHaveLength(1);
      expect(facts.dispatch).toHaveLength(1);
      expect(facts.session.version).toBe(2);
      expect(facts.task.version).toBe(4);
    }
  });
  it.each(["ACCEPT", "REASSIGN", "QUEUE"])(
    "serializes %s in both winner orders",
    async (kind) => {
      for (const cancellationFirst of [false, true]) {
        const { fixture, input } = await ctx.target(
          kind === "ACCEPT" ? "ASSIGNED" : "ACCEPTED",
        );
        const supervisor = await ctx.addMember(fixture, "VALET_SUPERVISOR");
        const nextOwner = await ctx.addMember(fixture);
        const barrier = cancellationSqlBarrier(ctx.runtimePool, (sql) =>
          cancellationFirst
            ? sql.includes("UPDATE tasks")
            : kind === "QUEUE"
              ? sql.includes("FROM valet_sessions") &&
                sql.includes("FOR UPDATE")
              : sql.includes("UPDATE tasks"),
        );
        const competitor = (pool: typeof ctx.runtimePool) =>
          kind === "ACCEPT"
            ? createAcceptTaskCommandExecutor(pool)({
                authenticatedUserId: fixture.userId,
                taskId: input.taskId,
                expectedVersion: 3,
              })
            : kind === "REASSIGN"
              ? createReassignTaskCommandExecutor(pool)({
                  authenticatedUserId: supervisor.userId,
                  taskId: input.taskId,
                  expectedVersion: 3,
                  targetAssigneeMembershipId: nextOwner.membershipId,
                  reason: "handoff",
                })
              : import("../src/modules/dispatch/queue-parking-task-command").then(
                  ({ createQueueParkingTaskCommandExecutor }) =>
                    createQueueParkingTaskCommandExecutor(pool)({
                      authenticatedUserId: fixture.userId,
                      sessionId: input.sessionId,
                    }),
                );
        const first = (
          cancellationFirst
            ? createCancelBeforeParkingCommandExecutor(barrier.pool)(input)
            : competitor(barrier.pool)
        ).catch((e) => e);
        await barrier.entered;
        const second = (
          cancellationFirst ? competitor(ctx.runtimePool) : ctx.cancel(input)
        ).catch((e) => e);
        try {
          await barrier.proveBlocked(ctx.adminPool);
        } finally {
          barrier.release();
        }
        const results = await Promise.all([first, second]);
        const facts = await ctx.cancellationFacts(fixture);
        if (cancellationFirst || kind === "QUEUE") {
          expect(facts.task.status).toBe("CANCELLED");
          expect(facts.history).toHaveLength(1);
        } else {
          expect(results[1]).toHaveProperty(
            "code",
            kind === "REASSIGN"
              ? "TASK_NOT_FOUND_OR_FORBIDDEN"
              : "VERSION_CONFLICT",
          );
          expect(facts.session.state).toBe("AWAITING_PARKING");
          expect(facts.history).toHaveLength(0);
        }
      }
    },
  );
});
