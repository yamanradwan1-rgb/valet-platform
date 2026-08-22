import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CustodyStaffAuthorizationError } from "../src/modules/staff/custody-staff-authorizer";
import { StaffValetSessionService } from "../src/modules/staff/staff-valet-session.service";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { createAbortHandoffExecutor } from "../src/modules/retrieval/abort-handoff-command";
import { createCompleteHandoffExecutor } from "../src/modules/retrieval/complete-handoff-command";
import { createInitiateHandoffExecutor } from "../src/modules/retrieval/initiate-handoff-command";
import { createMarkReadyCommandExecutor } from "../src/modules/retrieval/mark-ready-command";
import { createOverrideHandoffExecutor } from "../src/modules/retrieval/override-handoff-command";
import { createStartRetrievalCommandExecutor } from "../src/modules/retrieval/start-retrieval-command";
import { createVerifyHandoffExecutor } from "../src/modules/retrieval/verify-handoff-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import {
  HandoffTestContext,
  type HandoffFixture,
} from "./handoff-test-context";
import type { StartRetrievalFixture } from "./start-retrieval-test-context";

describe("Staff Valet Session Handoff Recovery Integration", () => {
  let context: HandoffTestContext;
  let reader: StaffValetSessionService;

  type ReadResult =
    | { kind: "denied"; code: string }
    | {
        kind: "ok";
        body: Awaited<ReturnType<StaffValetSessionService["getSessionDetail"]>>;
      };

  async function read(userId: string, sessionId: string): Promise<ReadResult> {
    try {
      const body = await reader.getSessionDetail(userId, sessionId);
      return { body, kind: "ok" };
    } catch (error: unknown) {
      if (error instanceof CustodyStaffAuthorizationError) {
        return { code: error.code, kind: "denied" };
      }
      throw error;
    }
  }

  async function composeRetrievalOwnedByB(): Promise<{
    base: StartRetrievalFixture;
    b: { membershipId: string; userId: string };
    a: string;
  }> {
    const base = await context.createStartRetrievalFixture();
    const employeeB = await context.addMember(base, "VALET_EMPLOYEE", true);
    await context.addMember(base, "VALET_EMPLOYEE", true);
    const supervisor = await context.addMember(base, "VALET_SUPERVISOR", true);
    // Audited dispatch reassignment establishes the new canonical owner.
    const reassigned = await createReassignTaskCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: supervisor.userId,
      expectedVersion: 3,
      reason: "Original owner shift ended",
      targetAssigneeMembershipId: employeeB.membershipId,
      taskId: base.retrievalTaskId,
    });
    const started = await createStartRetrievalCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: employeeB.userId,
      expectedSessionVersion: 5,
      expectedTaskVersion: reassigned.version,
      sessionId: base.sessionId,
    });
    await createMarkReadyCommandExecutor(context.runtimePool)({
      authenticatedUserId: employeeB.userId,
      expectedSessionVersion: started.sessionVersion,
      sessionId: base.sessionId,
    });
    // Fixture-setup fact from intake (not lifecycle fabrication): the
    // composed chain predates condition-completion persistence wiring.
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET check_in_condition_completed_at = transaction_timestamp(),
           check_in_condition_completed_by_membership_id = $2
       WHERE id = $1`,
      [base.sessionId, base.membershipId],
    );
    return { a: base.userId, b: employeeB, base };
  }

  async function attachGuestToken(
    fixture: StartRetrievalFixture,
  ): Promise<string> {
    const guestToken = randomBytes(32).toString("base64url");
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = transaction_timestamp() + interval '1 hour',
           customer_access_revoked_at = NULL
       WHERE id = $1`,
      [fixture.sessionId, hashGuestAccessToken(guestToken)],
    );
    return guestToken;
  }

  beforeAll(async () => {
    context = new HandoffTestContext("handoff_a1_recovery");
    await context.setup();
    reader = new StaffValetSessionService(context.runtimePool);
  }, 120_000);

  afterAll(async () => {
    await context.teardown();
  }, 60_000);

  it("keys HANDOFF_PENDING/COMPLETED reads to the retrieval owner with narrow supervisor support and safe projection", async () => {
    const { a, b, base } = await composeRetrievalOwnedByB();

    const readyRead = await read(b.userId, base.sessionId);
    expect(readyRead.kind).toBe("ok");
    if (readyRead.kind === "ok") {
      expect(readyRead.body.state).toBe("READY");
      expect(readyRead.body.handoff).toEqual({
        pendingAt: null,
        verification: null,
      });
    }
    expect((await read(a, base.sessionId)).kind).toBe("denied");

    const initiated = await createInitiateHandoffExecutor(context.runtimePool)({
      authenticatedUserId: b.userId,
      expectedSessionVersion: 7,
      sessionId: base.sessionId,
    });
    expect(initiated.state).toBe("HANDOFF_PENDING");
    expect(initiated.taskStatus).toBe("IN_PROGRESS");
    expect(initiated.sessionVersion).toBe(8);

    const pendingRead = await read(b.userId, base.sessionId);
    expect(pendingRead.kind).toBe("ok");
    if (pendingRead.kind === "ok") {
      expect(pendingRead.body.state).toBe("HANDOFF_PENDING");
      expect(pendingRead.body.handoff.pendingAt).not.toBeNull();
      expect(pendingRead.body.handoff.verification).toBeNull();
    }

    const unrelated = await context.addMember(base, "VALET_EMPLOYEE", false);
    expect((await read(unrelated.userId, base.sessionId)).kind).toBe("denied");

    const supervisor = await context.addMember(base, "VALET_SUPERVISOR", true);
    const supervisorRead = await read(supervisor.userId, base.sessionId);
    expect(supervisorRead.kind).toBe("ok");
    expect((await read(a, base.sessionId)).kind).toBe("denied");

    await createOverrideHandoffExecutor(context.runtimePool)({
      authenticatedUserId: supervisor.userId,
      expectedSessionVersion: 8,
      reason: "Guest identity confirmed at counter",
      sessionId: base.sessionId,
    });

    const verifiedRead = await read(b.userId, base.sessionId);
    if (verifiedRead.kind === "ok") {
      expect(verifiedRead.body.handoff.verification).toEqual({
        method: "SUPERVISOR_OVERRIDE",
        status: "VERIFIED",
        verifiedAt: expect.any(String),
      });
    } else {
      throw new Error("Owner read failed after override.");
    }

    // Overriding supervisor gains NO release authority.
    await expect(
      createCompleteHandoffExecutor(context.runtimePool)({
        authenticatedUserId: supervisor.userId,
        expectedSessionVersion: 9,
        sessionId: base.sessionId,
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });

    const completed = await createCompleteHandoffExecutor(context.runtimePool)({
      authenticatedUserId: b.userId,
      expectedSessionVersion: 9,
      sessionId: base.sessionId,
    });
    expect(completed.state).toBe("COMPLETED");
    expect(completed.taskStatus).toBe("COMPLETED");
    expect(completed.retrievalRequestStatus).toBe("COMPLETED");

    const completedOwnerRead = await read(b.userId, base.sessionId);
    if (completedOwnerRead.kind === "ok") {
      expect(completedOwnerRead.body.state).toBe("COMPLETED");
      expect(completedOwnerRead.body.handoff).toEqual({
        pendingAt: null,
        verification: null,
      });
    } else {
      throw new Error("Terminal owner recovery read failed.");
    }
    expect((await read(supervisor.userId, base.sessionId)).kind).toBe("denied");
    expect((await read(a, base.sessionId)).kind).toBe("denied");
  });

  it("projects pickup-code verification through real commands and supports owner abort back to READY", async () => {
    const { b, base } = await composeRetrievalOwnedByB();
    const guestToken = await attachGuestToken(base);
    const codebase: HandoffFixture = { ...base, guestToken };

    await createInitiateHandoffExecutor(context.runtimePool)({
      authenticatedUserId: b.userId,
      expectedSessionVersion: 7,
      sessionId: base.sessionId,
    });

    const antiAbuse = context.antiAbuse();
    const material = await context.issue(codebase, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE") {
      throw new Error("Expected pickup-code material.");
    }
    const pickupCode: string = material.pickupCode;

    await expect(
      createVerifyHandoffExecutor(context.runtimePool, antiAbuse)({
        authenticatedUserId: b.userId,
        expectedSessionVersion: 8,
        material: "0000",
        method: "PICKUP_CODE",
        sessionId: base.sessionId,
      }),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });

    const stillPending = await read(b.userId, base.sessionId);
    if (stillPending.kind === "ok") {
      expect(stillPending.body.handoff.verification?.status).toBe("PENDING");
      expect(stillPending.body.version).toBe(8);
    } else {
      throw new Error("Pending read lost after failed verification.");
    }

    await createVerifyHandoffExecutor(context.runtimePool, antiAbuse)({
      authenticatedUserId: b.userId,
      expectedSessionVersion: 8,
      material: pickupCode,
      method: "PICKUP_CODE",
      sessionId: base.sessionId,
    });

    const verifiedRead = await read(b.userId, base.sessionId);
    if (verifiedRead.kind === "ok") {
      expect(verifiedRead.body.handoff.verification).toMatchObject({
        method: "PICKUP_CODE",
        status: "VERIFIED",
      });
    } else {
      throw new Error("Verified recovery read failed.");
    }

    await createAbortHandoffExecutor(context.runtimePool)({
      authenticatedUserId: b.userId,
      expectedSessionVersion: 9,
      reason: "Guest stepped away from pickup",
      sessionId: base.sessionId,
    });

    const abortedRead = await read(b.userId, base.sessionId);
    if (abortedRead.kind === "ok") {
      expect(abortedRead.body.state).toBe("READY");
      expect(abortedRead.body.handoff.pendingAt).toBeNull();
      expect(abortedRead.body.handoff.verification).toBeNull();
    } else {
      throw new Error("Post-abort recovery read failed.");
    }
  });
});
