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
  expectBlockedBy,
  expectReassignResult,
  expectWait,
  pauseWriter,
  settled,
} from "./issue442-reassign-emergency-test-support";

const context = makeIssue442ReassignContext("order");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue442 genuine Task-first Reassign vs Session-first Emergency", () => {
  it("Reassign gets Task first: audit FK must coexist with Emergency's Session lock", async () => {
    const input = await assignedCase(context);
    const before = await context.snapshot(input.taskId);
    const baseline = await deadlocks(context);
    const gate = pauseWriter(context.runtimePool, "REASSIGN_TASK_UPDATE");
    let reassigned: ReturnType<typeof settled> | undefined;
    let emergency: ReturnType<typeof settled> | undefined;
    try {
      reassigned = settled(executeReassign(context, input, gate.pool));
      const reassignPid = await gate.held();
      emergency = settled(executeEmergency(context, input));
      await expectBlockedBy(context, reassignPid);
      gate.release();
      const [r, e] = await Promise.all([reassigned, emergency]);
      expect(r.status).toBe("fulfilled");
      expect(e).toMatchObject({
        status: "rejected",
        reason: { code: "VERSION_CONFLICT" },
      });
      await expectReassignResult(context, input, before);
      expect(await evidence(context, input.taskId)).toMatchObject({
        reassign_audits: 1,
        reassign_dispatch: 1,
        emergency_audits: 0,
        emergency_dispatch: 0,
        receipts: 0,
      });
      await assertNoDeadlocks(context, baseline);
    } finally {
      gate.release();
      await Promise.allSettled([reassigned, emergency].filter(Boolean));
    }
  }, 45_000);

  it("Emergency gets physical Session first: Reassign's FK write remains nonblocking", async () => {
    const input = await assignedCase(context);
    const before = await context.snapshot(input.taskId);
    const baseline = await deadlocks(context);
    const sessionGate = pauseWriter(context.runtimePool, "EMERGENCY_TASK_LOCK");
    const taskGate = pauseWriter(context.runtimePool, "REASSIGN_TASK_UPDATE");
    let emergency: ReturnType<typeof settled> | undefined;
    let reassigned: ReturnType<typeof settled> | undefined;
    try {
      emergency = settled(executeEmergency(context, input, sessionGate.pool));
      const emergencyPid = await sessionGate.held();
      reassigned = settled(executeReassign(context, input, taskGate.pool));
      const reassignPid = await taskGate.held();
      sessionGate.release();
      await expectWait(context, emergencyPid, reassignPid);
      taskGate.release();
      const [r, e] = await Promise.all([reassigned, emergency]);
      expect(r.status).toBe("fulfilled");
      expect(e).toMatchObject({
        status: "rejected",
        reason: { code: "VERSION_CONFLICT" },
      });
      await expectReassignResult(context, input, before);
      expect(await evidence(context, input.taskId)).toMatchObject({
        reassign_audits: 1,
        reassign_dispatch: 1,
        emergency_audits: 0,
        emergency_dispatch: 0,
        receipts: 0,
      });
      await assertNoDeadlocks(context, baseline);
    } finally {
      sessionGate.release();
      taskGate.release();
      await Promise.allSettled([reassigned, emergency].filter(Boolean));
    }
  }, 45_000);

  it("three independent simultaneous real-writer races converge without a deadlock", async () => {
    const baseline = await deadlocks(context);
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const input = await assignedCase(context);
      const before = await context.snapshot(input.taskId);
      const [r, e] = await Promise.all([
        settled(executeReassign(context, input)),
        settled(executeEmergency(context, input)),
      ]);
      expect(r.status).toBe("fulfilled");
      expect(e.status).toBe("rejected");
      if (e.status === "rejected") {
        expect(["TASK_INVALID_STATE", "VERSION_CONFLICT"]).toContain(
          (e.reason as { code?: string }).code,
        );
      }
      await expectReassignResult(context, input, before);
      expect(await evidence(context, input.taskId)).toMatchObject({
        reassign_audits: 1,
        reassign_dispatch: 1,
        emergency_audits: 0,
        emergency_dispatch: 0,
        receipts: 0,
      });
    }
    await assertNoDeadlocks(context, baseline);
  }, 90_000);
});
