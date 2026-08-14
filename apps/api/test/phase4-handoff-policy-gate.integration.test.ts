import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  Phase4RetrievalHandoffGateContext,
  type RequestedGateFixture,
  type RetrievalOwner,
} from "./phase4-retrieval-handoff-gate-test-context";

const context = new Phase4RetrievalHandoffGateContext("policy");

type PendingFixture = RequestedGateFixture & RetrievalOwner;

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new Error(`Missing string ${key}.`);
  return value;
}

async function pending(): Promise<PendingFixture> {
  const requested = await context.requestRetrieval(
    await context.createParkedFixture(),
  );
  return context.reachHandoffPending(await context.assignAndAccept(requested));
}

async function issuePickup(fixture: PendingFixture) {
  return context.guestPost(
    fixture.guestToken,
    "/v1/guest/session/handoff-verification/issue",
    { method: "PICKUP_CODE" },
  );
}

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-006H handoff proof and policy gate", () => {
  it("rejects invalid proof without advancing the session", async () => {
    const fixture = await pending();
    const issued = await issuePickup(fixture);
    const pickupCode = text(issued.body, "pickupCode");
    const invalidCode = pickupCode === "0000" ? "0001" : "0000";
    const response = await context.staffPost(
      fixture.accessToken,
      `/v1/staff/valet-sessions/${fixture.sessionId}/verify-pickup-code`,
      {
        expectedSessionVersion: fixture.sessionVersion,
        pickupCode: invalidCode,
      },
    );
    expect(response).toMatchObject({
      status: 409,
      body: { code: "HANDOFF_VERIFICATION_FAILED" },
    });
    const projection = await context.adminPool.query<Record<string, unknown>>(
      `SELECT session.state::text AS state, session.version,
              verification.attempt_count, verification.verified_at,
              verification.consumed_at
       FROM valet_sessions AS session
       INNER JOIN handoff_verifications AS verification
         ON verification.valet_session_id = session.id
       WHERE session.id = $1`,
      [fixture.sessionId],
    );
    expect(projection.rows[0]).toMatchObject({
      attempt_count: 1,
      consumed_at: null,
      state: "HANDOFF_PENDING",
      verified_at: null,
      version: fixture.sessionVersion,
    });
  });

  it("rejects an expired proof through the production verification route", async () => {
    const fixture = await pending();
    const issued = await issuePickup(fixture);
    await context.adminPool.query(
      `UPDATE handoff_verifications
       SET expires_at = clock_timestamp() - interval '1 second'
       WHERE valet_session_id = $1 AND consumed_at IS NULL`,
      [fixture.sessionId],
    );
    expect(
      await context.staffPost(
        fixture.accessToken,
        `/v1/staff/valet-sessions/${fixture.sessionId}/verify-pickup-code`,
        {
          expectedSessionVersion: fixture.sessionVersion,
          pickupCode: text(issued.body, "pickupCode"),
        },
      ),
    ).toMatchObject({
      status: 409,
      body: { code: "HANDOFF_VERIFICATION_FAILED" },
    });
  });

  it("re-evaluates policy and consumed proof before final release", async () => {
    let fixture = await pending();
    fixture = await context.verifyStandard(fixture, "PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE organizations SET handoff_standard_method_policy = 'DYNAMIC_QR'
       WHERE id = $1`,
      [fixture.organizationId],
    );
    expect(await context.complete(fixture)).toMatchObject({
      status: 409,
      body: { code: "HANDOFF_VERIFICATION_FAILED" },
    });
    await context.adminPool.query(
      `UPDATE organizations SET handoff_standard_method_policy = 'EITHER'
       WHERE id = $1`,
      [fixture.organizationId],
    );
    await context.adminPool.query(
      `UPDATE handoff_verifications SET consumed_at = clock_timestamp()
       WHERE valet_session_id = $1 AND consumed_at IS NULL`,
      [fixture.sessionId],
    );
    expect(await context.complete(fixture)).toMatchObject({
      status: 409,
      body: { code: "HANDOFF_VERIFICATION_FAILED" },
    });
    expect(await context.guestGet(fixture.guestToken)).toMatchObject({
      status: 200,
      body: { state: "HANDOFF_PENDING" },
    });
  });

  it("allows exactly one simultaneous final-release winner", async () => {
    let fixture = await pending();
    fixture = await context.verifyStandard(fixture, "DYNAMIC_QR");
    const outcomes = await Promise.all([
      context.complete(fixture),
      context.complete(fixture),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      200, 409,
    ]);
    const projection = await context.adminPool.query<Record<string, unknown>>(
      `SELECT session.state::text AS state, request.status::text AS request_status,
              task.status::text AS task_status, verification.consumed_at
       FROM valet_sessions AS session
       INNER JOIN retrieval_requests AS request ON request.id = $2
       INNER JOIN tasks AS task ON task.id = $3
       INNER JOIN handoff_verifications AS verification
         ON verification.valet_session_id = session.id
       WHERE session.id = $1`,
      [fixture.sessionId, fixture.requestId, fixture.taskId],
    );
    expect(projection.rows[0]).toMatchObject({
      consumed_at: expect.any(Date),
      request_status: "COMPLETED",
      state: "COMPLETED",
      task_status: "COMPLETED",
    });
    expect(await context.eventTypes("dispatch_events", fixture.taskId)).toEqual(
      ["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"],
    );
  });
});
