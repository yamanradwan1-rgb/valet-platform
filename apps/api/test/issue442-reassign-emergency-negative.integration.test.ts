import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { revokeStaffSessionAndDisablePush } from "../src/modules/auth/staff-session-revocation";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  assignedCase,
  evidence,
  inProgressCase,
  makeIssue442ReassignContext,
} from "./issue442-reassign-emergency-fixture";
import {
  assertNoDeadlocks,
  deadlocks,
  executeEmergency,
  executeReassign,
  expectBlockedBy,
  pauseWriter,
  settled,
} from "./issue442-reassign-emergency-test-support";

const context = makeIssue442ReassignContext("negative");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue442 real writer authority and invalid Task state guards", () => {
  it("Emergency succeeds first on IN_PROGRESS, stale Reassign rejects without a second write", async () => {
    const input = await inProgressCase(context);
    const before = await context.snapshot(input.taskId);
    const baseline = await deadlocks(context);
    const gate = pauseWriter(context.runtimePool, "BEFORE_COMMIT");
    let emergency: ReturnType<typeof settled> | undefined;
    let reassign: ReturnType<typeof settled> | undefined;
    try {
      emergency = settled(executeEmergency(context, input, gate.pool));
      const emergencyPid = await gate.held();
      reassign = settled(executeReassign(context, input));
      await expectBlockedBy(context, emergencyPid);
      gate.release();
      const [e, r] = await Promise.all([emergency, reassign]);
      expect(e).toMatchObject({
        status: "fulfilled",
        value: { replayed: false },
      });
      expect(r).toMatchObject({
        status: "rejected",
        reason: { code: "VERSION_CONFLICT" },
      });
      const after = await context.snapshot(input.taskId);
      expect(after).toMatchObject({
        task_status: "IN_PROGRESS",
        task_assignee: input.replacementMembershipId,
        task_version: before.task_version + 1,
        session_version: before.session_version + 1,
        session_state: before.session_state,
        audit_count: before.audit_count + 1,
        dispatch_count: before.dispatch_count + 1,
        custody_count: before.custody_count,
      });
      expect(await evidence(context, input.taskId)).toMatchObject({
        reassign_audits: 0,
        reassign_dispatch: 0,
        emergency_audits: 1,
        emergency_dispatch: 1,
        receipts: 1,
      });
      const repeated = await executeEmergency(context, input);
      expect(repeated).toMatchObject({
        operationId: input.emergency.operationId,
        replayed: true,
      });
      await assertNoDeadlocks(context, baseline);
    } finally {
      gate.release();
      await Promise.allSettled([emergency, reassign].filter(Boolean));
    }
  }, 45_000);

  it("revoked exact Staff session denies Emergency after its Session lock, with no evidence", async () => {
    const input = await assignedCase(context);
    const before = await context.snapshot(input.taskId);
    const originalEvidence = await evidence(context, input.taskId);
    const baseline = await deadlocks(context);
    const gate = pauseWriter(context.runtimePool, "EMERGENCY_CREDENTIAL");
    let emergency: ReturnType<typeof settled> | undefined;
    try {
      emergency = settled(executeEmergency(context, input, gate.pool));
      await gate.held();
      const client = await context.runtimePool.connect();
      try {
        await client.query("BEGIN");
        await revokeStaffSessionAndDisablePush(
          client,
          input.emergency.staffSessionContext.staffAuthSessionId,
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      const credential = await context.adminPool.query<{
        revoked_at: Date | null;
      }>("SELECT revoked_at FROM staff_auth_sessions WHERE id=$1", [
        input.emergency.staffSessionContext.staffAuthSessionId,
      ]);
      expect(credential.rows[0]?.revoked_at).toBeInstanceOf(Date);
      gate.release();
      const result = await emergency;
      expect(result).toMatchObject({
        status: "rejected",
        reason: { status: 401 },
      });
      expect(await context.snapshot(input.taskId)).toEqual(before);
      expect(await evidence(context, input.taskId)).toEqual(originalEvidence);
      await assertNoDeadlocks(context, baseline);
    } finally {
      gate.release();
      await Promise.allSettled([emergency].filter(Boolean));
    }
  }, 45_000);

  it("a real Shift End makes B ineligible while Emergency waits to acquire Task", async () => {
    const input = await inProgressCase(context);
    const before = await context.snapshot(input.taskId);
    const originalEvidence = await evidence(context, input.taskId);
    const baseline = await deadlocks(context);
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id=$1 AND status='ACTIVE'`,
      [input.replacementMembershipId],
    );
    expect(shift.rows).toHaveLength(1);
    const gate = pauseWriter(context.runtimePool, "EMERGENCY_TASK_LOCK");
    let emergency: ReturnType<typeof settled> | undefined;
    try {
      emergency = settled(executeEmergency(context, input, gate.pool));
      await gate.held();
      const ended = await createEndShiftCommandExecutor(context.runtimePool, {
        presenceFingerprintKey: Buffer.alloc(32, 0x42),
      })({
        authenticatedUserId: input.replacementUserId,
        cashReported: "0.000",
        shiftId: shift.rows[0]!.id,
      });
      expect(ended.status).toBe("ENDED");
      gate.release();
      const result = await emergency;
      expect(result).toMatchObject({
        status: "rejected",
        reason: { code: "TASK_ASSIGNEE_NOT_ELIGIBLE" },
      });
      expect(await context.snapshot(input.taskId)).toEqual(before);
      expect(await evidence(context, input.taskId)).toEqual(originalEvidence);
      await assertNoDeadlocks(context, baseline);
    } finally {
      gate.release();
      await Promise.allSettled([emergency].filter(Boolean));
    }
  }, 45_000);
});
