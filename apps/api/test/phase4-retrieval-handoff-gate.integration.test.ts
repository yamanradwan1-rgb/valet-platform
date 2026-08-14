import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Phase4RetrievalHandoffGateContext } from "./phase4-retrieval-handoff-gate-test-context";

const context = new Phase4RetrievalHandoffGateContext("flow");

function number(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  expect(typeof value).toBe("number");
  return value as number;
}

async function assertGuestProjection(token: string, state: string) {
  const guest = await context.guestGet(token);
  expect(guest).toMatchObject({ status: 200, body: { state } });
  expect(guest.headers.get("cache-control")).toBe("no-store");
  expect(JSON.stringify(guest.body)).not.toMatch(
    /organization|location|key.?slot|parking|zone|spot|assignee|membership|user.?id|gps|coordinate|audit|dispatch|verifier|hmac|secret|authorization/i,
  );
}

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-006H Phase 4 production HTTP gate", () => {
  it("composes PARKED through PICKUP_CODE release with real Guest and Staff authority", async () => {
    const parked = await context.createParkedFixture();
    await assertGuestProjection(parked.guestToken, "PARKED");
    const requested = await context.requestRetrieval(parked);
    await assertGuestProjection(requested.guestToken, "REQUESTED");

    const queue = await context.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${requested.locationId}`,
      { token: requested.accessToken },
    );
    expect(queue.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: requested.sessionId,
          status: "QUEUED",
          taskId: requested.taskId,
          taskType: "RETRIEVAL",
        }),
      ]),
    );

    let owned = await context.assignAndAccept(requested);
    const nonOwner = await context.addOperationalMember(
      parked,
      "VALET_EMPLOYEE",
    );
    const denied = await context.staffPost(
      nonOwner.accessToken,
      `/v1/staff/valet-sessions/${owned.sessionId}/start-retrieval`,
      {
        expectedSessionVersion: owned.sessionVersion,
        expectedTaskVersion: owned.taskVersion,
      },
    );
    expect(denied).toMatchObject({
      status: 404,
      body: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
    });

    const path = `/v1/staff/valet-sessions/${owned.sessionId}`;
    const started = await context.staffPost(
      owned.accessToken,
      `${path}/start-retrieval`,
      {
        expectedSessionVersion: owned.sessionVersion,
        expectedTaskVersion: owned.taskVersion,
      },
    );
    expect(started).toMatchObject({
      status: 200,
      body: { state: "RETRIEVING", taskStatus: "IN_PROGRESS" },
    });
    await assertGuestProjection(owned.guestToken, "RETRIEVING");

    const ready = await context.staffPost(
      owned.accessToken,
      `${path}/mark-ready`,
      { expectedSessionVersion: number(started.body, "sessionVersion") },
    );
    expect(ready).toMatchObject({
      status: 200,
      body: { state: "READY", taskStatus: "IN_PROGRESS" },
    });
    await assertGuestProjection(owned.guestToken, "READY");

    const initiated = await context.staffPost(
      owned.accessToken,
      `${path}/initiate-handoff`,
      { expectedSessionVersion: number(ready.body, "sessionVersion") },
    );
    owned = {
      ...owned,
      sessionVersion: number(initiated.body, "sessionVersion"),
      taskVersion: number(initiated.body, "taskVersion"),
    };
    await assertGuestProjection(owned.guestToken, "HANDOFF_PENDING");
    const standard = await context.issueAndVerifyStandard(owned, "PICKUP_CODE");
    const verified = standard.fixture;
    const completed = await context.complete(verified);
    expect(completed).toMatchObject({
      status: 200,
      body: {
        retrievalRequestStatus: "COMPLETED",
        state: "COMPLETED",
        taskStatus: "COMPLETED",
      },
    });
    await assertGuestProjection(owned.guestToken, "COMPLETED");

    const retry = await context.staffPost(
      verified.accessToken,
      `${path}/complete-handoff`,
      { expectedSessionVersion: verified.sessionVersion },
    );
    expect(retry.status).toBe(409);

    const projection = await context.adminPool.query<Record<string, unknown>>(
      `SELECT session.state::text AS session_state, session.version,
              session.completed_at, session.completed_by_membership_id::text,
              session.key_slot_id::text, session.parking_spot_id::text,
              session.ready_at, session.retrieval_started_at,
              request.status::text AS request_status,
              task.status::text AS task_status, task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee,
              verification.verified_at, verification.consumed_at
       FROM valet_sessions AS session
       INNER JOIN retrieval_requests AS request ON request.id = $2
       INNER JOIN tasks AS task ON task.id = $3
       INNER JOIN handoff_verifications AS verification
         ON verification.valet_session_id = session.id
       WHERE session.id = $1`,
      [owned.sessionId, owned.requestId, owned.taskId],
    );
    expect(projection.rows[0]).toMatchObject({
      completed_by_membership_id: owned.membershipId,
      key_slot_id: null,
      parking_spot_id: null,
      request_status: "COMPLETED",
      session_state: "COMPLETED",
      task_assignee: owned.membershipId,
      task_status: "COMPLETED",
      task_version: owned.taskVersion + 1,
    });
    expect(projection.rows[0]?.completed_at).not.toBeNull();
    expect(projection.rows[0]?.ready_at).not.toBeNull();
    expect(projection.rows[0]?.retrieval_started_at).not.toBeNull();
    expect(projection.rows[0]?.verified_at).not.toBeNull();
    expect(projection.rows[0]?.consumed_at).not.toBeNull();

    expect(
      await context.eventTypes("key_custody_events", owned.sessionId),
    ).toEqual([
      "SLOT_ASSIGNED",
      "CHECKED_OUT",
      "RETURNED_TO_SLOT",
      "CHECKED_OUT",
      "RELEASED",
    ]);
    expect(await context.eventTypes("dispatch_events", owned.taskId)).toEqual([
      "QUEUED",
      "ASSIGNED",
      "ACCEPTED",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
    const audits = await context.auditEvents(owned.sessionId, owned.taskId);
    expect(audits.map((event) => event.event_type)).toEqual(
      expect.arrayContaining([
        "RETRIEVAL_REQUESTED",
        "TASK_ASSIGNED",
        "TASK_ACCEPTED",
        "VALET_SESSION_RETRIEVAL_STARTED",
        "VALET_SESSION_READY",
        "VALET_SESSION_HANDOFF_INITIATED",
        "HANDOFF_VERIFIED",
        "VALET_SESSION_VEHICLE_RELEASED",
        "VALET_SESSION_COMPLETED",
      ]),
    );
    for (const eventType of [
      "VALET_SESSION_VEHICLE_RELEASED",
      "VALET_SESSION_COMPLETED",
    ]) {
      expect(
        audits.filter((audit) => audit.event_type === eventType),
      ).toHaveLength(1);
    }
    for (const audit of audits) {
      const metadata = JSON.stringify(audit.metadata_json);
      expect(metadata).not.toContain(owned.accessToken);
      expect(metadata).not.toContain(owned.guestToken);
      expect(metadata).not.toContain(standard.proofMaterial);
      expect(metadata).not.toMatch(
        /"[^"]*(?:authorization|bearer|access.?token|refresh.?token|pickup.?code|qr.?payload|verifier|hmac|password|secret)[^"]*"\s*:/i,
      );
    }
  });

  it("composes DYNAMIC_QR release and supervisor override without transferring ownership", async () => {
    for (const mode of ["DYNAMIC_QR", "SUPERVISOR_OVERRIDE"] as const) {
      const parked = await context.createParkedFixture();
      const requested = await context.requestRetrieval(parked);
      const owner = await context.addOperationalMember(
        parked,
        "VALET_EMPLOYEE",
      );
      const supervisor = await context.addOperationalMember(
        parked,
        "VALET_SUPERVISOR",
      );
      let owned = await context.assignAndAccept(requested, owner, supervisor);
      owned = await context.reachHandoffPending(owned);
      if (mode === "DYNAMIC_QR") {
        owned = await context.verifyStandard(owned, mode);
      } else {
        const overridden = await context.staffPost(
          supervisor.accessToken,
          `/v1/staff/valet-sessions/${owned.sessionId}/supervisor-override-handoff`,
          {
            expectedSessionVersion: owned.sessionVersion,
            reason: "Guest identity matched the controlled record",
          },
        );
        owned = {
          ...owned,
          sessionVersion: number(overridden.body, "sessionVersion"),
        };
        const supervisorRelease = await context.complete({
          ...owned,
          accessToken: supervisor.accessToken,
          membershipId: supervisor.membershipId,
          userId: supervisor.userId,
        });
        expect(supervisorRelease).toMatchObject({
          status: 404,
          body: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
        });
      }
      expect(await context.complete(owned)).toMatchObject({
        status: 200,
        body: { state: "COMPLETED" },
      });
      const verification = await context.adminPool.query<{
        consumed_at: Date | null;
        method: string;
      }>(
        `SELECT method::text, consumed_at FROM handoff_verifications
         WHERE valet_session_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [owned.sessionId],
      );
      expect(verification.rows[0]).toMatchObject({
        consumed_at: expect.any(Date),
        method: mode,
      });
      if (mode === "SUPERVISOR_OVERRIDE") {
        const overrideAudit = await context.adminPool.query<{
          actor_membership_id: string;
          metadata_json: Record<string, unknown>;
        }>(
          `SELECT actor_membership_id::text, metadata_json FROM audit_events
           WHERE valet_session_id = $1 AND event_type = 'HANDOFF_SUPERVISOR_OVERRIDE'`,
          [owned.sessionId],
        );
        expect(overrideAudit.rows[0]).toMatchObject({
          actor_membership_id: supervisor.membershipId,
        });
        expect(JSON.stringify(overrideAudit.rows[0]?.metadata_json)).toContain(
          "Guest identity matched the controlled record",
        );
      }
    }
  });
});
