import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  Phase4RetrievalHandoffGateContext,
  type RequestedGateFixture,
} from "./phase4-retrieval-handoff-gate-test-context";

const context = new Phase4RetrievalHandoffGateContext("security");

function number(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number") throw new Error(`Missing number ${key}.`);
  return value;
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new Error(`Missing string ${key}.`);
  return value;
}

async function requested(): Promise<RequestedGateFixture> {
  return context.requestRetrieval(await context.createParkedFixture());
}

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-006H Retrieval security gate", () => {
  it("makes reassignment history canonical and transfers task authority", async () => {
    const fixture = await requested();
    const firstOwner = await context.addOperationalMember(
      fixture,
      "VALET_EMPLOYEE",
    );
    const nextOwner = await context.addOperationalMember(
      fixture,
      "VALET_EMPLOYEE",
    );
    const supervisor = await context.addOperationalMember(
      fixture,
      "VALET_SUPERVISOR",
    );
    const first = await context.assignAndAccept(
      fixture,
      firstOwner,
      supervisor,
    );
    const reassigned = await context.staffPost(
      supervisor.accessToken,
      `/v1/staff/tasks/${fixture.taskId}/reassign`,
      {
        expectedVersion: first.taskVersion,
        reason: "  Retrieval lane handoff  ",
        targetAssigneeMembershipId: nextOwner.membershipId,
      },
    );
    expect(reassigned).toMatchObject({
      status: 200,
      body: {
        currentAssigneeMembershipId: nextOwner.membershipId,
        status: "ACCEPTED",
        version: first.taskVersion + 1,
      },
    });
    const startBody = {
      expectedSessionVersion: fixture.sessionVersion,
      expectedTaskVersion: number(reassigned.body, "version"),
    };
    expect(
      await context.staffPost(
        firstOwner.accessToken,
        `/v1/staff/valet-sessions/${fixture.sessionId}/start-retrieval`,
        startBody,
      ),
    ).toMatchObject({
      status: 404,
      body: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
    });
    expect(
      await context.staffPost(
        nextOwner.accessToken,
        `/v1/staff/valet-sessions/${fixture.sessionId}/start-retrieval`,
        startBody,
      ),
    ).toMatchObject({ status: 200, body: { state: "RETRIEVING" } });

    expect(await context.eventTypes("dispatch_events", fixture.taskId)).toEqual(
      ["QUEUED", "ASSIGNED", "ACCEPTED", "REASSIGNED", "IN_PROGRESS"],
    );
    const history = await context.adminPool.query<Record<string, unknown>>(
      `SELECT actor_membership_id::text,
              previous_assignee_membership_id::text,
              new_assignee_membership_id::text, reason
       FROM dispatch_events
       WHERE task_id = $1 AND event_type = 'REASSIGNED'`,
      [fixture.taskId],
    );
    expect(history.rows[0]).toEqual({
      actor_membership_id: supervisor.membershipId,
      new_assignee_membership_id: nextOwner.membershipId,
      previous_assignee_membership_id: firstOwner.membershipId,
      reason: "Retrieval lane handoff",
    });
  });

  it("conceals cross-tenant and wrong-location work through final release", async () => {
    const fixture = await requested();
    const foreign = await context.createGateFixture();
    const wrongLocation = await context.authorizeWrongLocation(fixture);
    let owner = await context.assignAndAccept(fixture);
    const path = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    for (const token of [foreign.accessToken, wrongLocation]) {
      expect(
        await context.staffPost(token, `${path}/start-retrieval`, {
          expectedSessionVersion: owner.sessionVersion,
          expectedTaskVersion: owner.taskVersion,
        }),
      ).toMatchObject({
        status: 404,
        body: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
      });
    }
    owner = await context.reachHandoffPending(owner);
    const issued = await context.guestPost(
      fixture.guestToken,
      "/v1/guest/session/handoff-verification/issue",
      { method: "PICKUP_CODE" },
    );
    const verifyBody = {
      expectedSessionVersion: owner.sessionVersion,
      pickupCode: text(issued.body, "pickupCode"),
    };
    for (const token of [foreign.accessToken, wrongLocation]) {
      expect(
        await context.staffPost(
          token,
          `${path}/verify-pickup-code`,
          verifyBody,
        ),
      ).toMatchObject({
        status: 404,
        body: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
      });
    }
    const verified = await context.staffPost(
      owner.accessToken,
      `${path}/verify-pickup-code`,
      verifyBody,
    );
    owner = {
      ...owner,
      sessionVersion: number(verified.body, "sessionVersion"),
    };
    for (const token of [foreign.accessToken, wrongLocation]) {
      expect(
        await context.staffPost(token, `${path}/complete-handoff`, {
          expectedSessionVersion: owner.sessionVersion,
        }),
      ).toMatchObject({
        status: 404,
        body: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
      });
    }
    expect(await context.complete(owner)).toMatchObject({
      status: 200,
      body: { state: "COMPLETED" },
    });
  });

  it("denies the current task owner after its active shift ends", async () => {
    const fixture = await requested();
    const owner = await context.addOperationalMember(fixture, "VALET_EMPLOYEE");
    const supervisor = await context.addOperationalMember(
      fixture,
      "VALET_SUPERVISOR",
    );
    const assigned = await context.assignAndAccept(fixture, owner, supervisor);
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp()
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [owner.membershipId],
    );
    expect(
      await context.staffPost(
        owner.accessToken,
        `/v1/staff/valet-sessions/${fixture.sessionId}/start-retrieval`,
        {
          expectedSessionVersion: assigned.sessionVersion,
          expectedTaskVersion: assigned.taskVersion,
        },
      ),
    ).toMatchObject({
      status: 404,
      body: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
    });
  });
});
