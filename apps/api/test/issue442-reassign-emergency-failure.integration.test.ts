import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assignedCase,
  evidence,
  makeIssue442ReassignContext,
} from "./issue442-reassign-emergency-fixture";
import {
  assertNoDeadlocks,
  deadlocks,
  executeEmergency,
  executeReassign,
  expectReassignResult,
  pauseWriter,
  settled,
  withLocalLockTimeout,
} from "./issue442-reassign-emergency-test-support";

const context = makeIssue442ReassignContext("failure");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue442 real-executor rollback, bounded lock timeout and retry", () => {
  it("rolls back the full Reassign before COMMIT, then retries without duplicate history", async () => {
    const input = await assignedCase(context);
    const snapshot = await context.snapshot(input.taskId);
    const events = await evidence(context, input.taskId);
    const baseline = await deadlocks(context);
    const gate = pauseWriter(context.runtimePool, "BEFORE_COMMIT", true);
    let pending: ReturnType<typeof settled> | undefined;
    try {
      pending = settled(executeReassign(context, input, gate.pool));
      await gate.held();
      gate.release();
      const failed = await pending;
      expect(failed).toMatchObject({ status: "rejected" });
      if (failed.status === "rejected") {
        expect(failed.reason).toMatchObject({
          message: "Issue442 test-controlled pre-COMMIT rollback.",
        });
      }
      expect(await context.snapshot(input.taskId)).toEqual(snapshot);
      expect(await evidence(context, input.taskId)).toEqual(events);
      const retried = await executeReassign(context, input);
      expect(retried).toMatchObject({
        version: snapshot.task_version + 1,
        currentAssigneeMembershipId: input.replacementMembershipId,
      });
      await expectReassignResult(context, input, snapshot);
      expect(await evidence(context, input.taskId)).toMatchObject({
        reassign_audits: events.reassign_audits + 1,
        reassign_dispatch: events.reassign_dispatch + 1,
        emergency_audits: 0,
        emergency_dispatch: 0,
        receipts: 0,
      });
      await expect(executeEmergency(context, input)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
      await assertNoDeadlocks(context, baseline);
    } finally {
      gate.release();
      await Promise.allSettled([pending].filter(Boolean));
    }
  }, 45_000);

  it("a bounded Task lock timeout leaves no partial effects; retry is safe", async () => {
    const input = await assignedCase(context);
    const snapshot = await context.snapshot(input.taskId);
    const events = await evidence(context, input.taskId);
    const baseline = await deadlocks(context);
    const blocker = await context.adminPool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM tasks WHERE id=$1 FOR UPDATE", [
        input.taskId,
      ]);
      const timed = await settled(
        executeReassign(
          context,
          input,
          withLocalLockTimeout(context.runtimePool, 150),
        ),
      );
      expect(timed).toMatchObject({
        status: "rejected",
        reason: { code: "55P03" },
      });
      expect(await context.snapshot(input.taskId)).toEqual(snapshot);
      expect(await evidence(context, input.taskId)).toEqual(events);
      await blocker.query("COMMIT");
      await executeReassign(context, input);
      await expectReassignResult(context, input, snapshot);
      expect(await evidence(context, input.taskId)).toMatchObject({
        reassign_audits: events.reassign_audits + 1,
        reassign_dispatch: events.reassign_dispatch + 1,
        emergency_audits: 0,
        emergency_dispatch: 0,
        receipts: 0,
      });
      await assertNoDeadlocks(context, baseline);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
  }, 45_000);
});
