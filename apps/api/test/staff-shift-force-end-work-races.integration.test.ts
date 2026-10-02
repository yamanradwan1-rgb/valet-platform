import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StaffShiftForceEndService } from "../src/modules/management/staff-shift-force-end.service";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";
import {
  holdForceEndTestCommit,
  waitForceEndTestBlocked,
} from "./staff-shift-force-end-race-fixture";

const fixture = new StaffShiftForceEndTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("T05-F immutable closure vs real operational commands", () => {
  it.each([false, true])(
    "self-end first, rollback=%s",
    async (rollback) => {
      const s = await fixture.scenario(),
        pool = fixture.runtimePool();
      const gate = holdForceEndTestCommit(pool, rollback);
      let first: Promise<unknown> | undefined;
      let force: ReturnType<typeof fixture.force> | undefined;
      try {
        first = createEndShiftCommandExecutor(gate.pool)({
          authenticatedUserId: s.targetUser.id,
          shiftId: s.shiftId,
          cashReported: "7.000",
        }).catch((error: unknown) => error);
        await gate.held;
        force = fixture.force(s);
        await waitForceEndTestBlocked(fixture);
        gate.release();
        await first;
        const result = await force;
        expect(result.status).toBe(rollback ? 201 : 409);
        const state = await fixture.snapshot(s.shiftId);
        expect(state.cash_reported).toBe(rollback ? null : "7.000");
        expect(state.audits).toBe(rollback ? 1 : 0);
        expect(state.closures).toBe(rollback ? 1 : 0);
      } finally {
        gate.release();
        await first;
        await force;
        await pool.end();
      }
    },
    30_000,
  );

  it.each([false, true])(
    "Force End first vs self-end, rollback=%s",
    async (rollback) => {
      const s = await fixture.scenario(),
        pool = fixture.runtimePool();
      const gate = holdForceEndTestCommit(pool, rollback);
      let first: Promise<unknown> | undefined,
        self: Promise<unknown> | undefined;
      try {
        first = new StaffShiftForceEndService(gate.pool)
          .execute(s.context, s.organizationId, s.shiftId, s.command)
          .catch((error: unknown) => error);
        await gate.held;
        self = createEndShiftCommandExecutor(pool)({
          authenticatedUserId: s.targetUser.id,
          shiftId: s.shiftId,
          cashReported: "7.000",
        }).catch((error: unknown) => error);
        await waitForceEndTestBlocked(fixture);
        gate.release();
        await first;
        const result = await self;
        expect(result).toMatchObject(
          rollback
            ? { status: "ENDED" }
            : { code: "SHIFT_CASH_RECONCILIATION_UNAVAILABLE" },
        );
        const state = await fixture.snapshot(s.shiftId);
        expect(state.cash_reported).toBe(rollback ? "7.000" : null);
        expect(state.audits).toBe(rollback ? 0 : 1);
      } finally {
        gate.release();
        await first;
        await self;
        await pool.end();
      }
    },
    30_000,
  );

  it.each([false, true])(
    "assignment first holds eligibility through commit, rollback=%s",
    async (rollback) => {
      const s = await fixture.scenario(),
        task = await fixture.task(s),
        pool = fixture.runtimePool();
      const gate = holdForceEndTestCommit(pool, rollback);
      let first: Promise<unknown> | undefined;
      let force: ReturnType<typeof fixture.force> | undefined;
      try {
        first = createAssignTaskCommandExecutor(gate.pool)({
          authenticatedUserId: s.targetUser.id,
          taskId: task.taskId,
          expectedVersion: 1,
        }).catch((error: unknown) => error);
        await gate.held;
        force = fixture.force(s);
        await waitForceEndTestBlocked(fixture);
        gate.release();
        await first;
        const result = await force;
        expect(result.status).toBe(rollback ? 201 : 409);
        if (!rollback)
          expect(result.body?.code).toBe("OPEN_TASK_HANDOFF_REQUIRED");
        expect(await fixture.snapshot(s.shiftId)).toMatchObject({
          status: rollback ? "ENDED" : "ACTIVE",
          closures: rollback ? 1 : 0,
          audits: rollback ? 1 : 0,
        });
        const current = await fixture.query(
          "SELECT status::text,version FROM tasks WHERE id=$1",
          [task.taskId],
        );
        expect(current.rows[0]).toEqual({
          status: rollback ? "QUEUED" : "ASSIGNED",
          version: rollback ? 1 : 2,
        });
      } finally {
        gate.release();
        await first;
        await force;
        await pool.end();
      }
    },
    30_000,
  );

  it.each([false, true])(
    "Force End first fences new assignment, rollback=%s",
    async (rollback) => {
      const s = await fixture.scenario(),
        task = await fixture.task(s),
        pool = fixture.runtimePool();
      const gate = holdForceEndTestCommit(pool, rollback);
      let first: Promise<unknown> | undefined,
        assign: Promise<unknown> | undefined;
      try {
        first = new StaffShiftForceEndService(gate.pool)
          .execute(s.context, s.organizationId, s.shiftId, s.command)
          .catch((error: unknown) => error);
        await gate.held;
        assign = createAssignTaskCommandExecutor(pool)({
          authenticatedUserId: s.targetUser.id,
          taskId: task.taskId,
          expectedVersion: 1,
        }).catch((error: unknown) => error);
        await waitForceEndTestBlocked(fixture);
        gate.release();
        await first;
        const result = await assign;
        expect(result).toMatchObject(
          rollback
            ? { status: "ASSIGNED" }
            : { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
        );
        const current = await fixture.query(
          "SELECT status::text,version FROM tasks WHERE id=$1",
          [task.taskId],
        );
        expect(current.rows[0]).toEqual({
          status: rollback ? "ASSIGNED" : "QUEUED",
          version: rollback ? 2 : 1,
        });
      } finally {
        gate.release();
        await first;
        await assign;
        await pool.end();
      }
    },
    30_000,
  );
});
