import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Phase4RetrievalCancellationTestContext } from "./phase4-retrieval-cancellation-test-context";

const context = new Phase4RetrievalCancellationTestContext("safety");

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

async function rejectCancellationAudit(operation: () => Promise<unknown>) {
  await context.adminPool.query(
    `CREATE FUNCTION reject_retrieval_cancel_audit() RETURNS trigger
     LANGUAGE plpgsql AS $$
     BEGIN
       IF NEW.event_type = 'RETRIEVAL_CANCELLED' THEN
         RAISE EXCEPTION 'injected cancellation audit failure';
       END IF;
       RETURN NEW;
     END $$;
     CREATE TRIGGER reject_retrieval_cancel_audit
     BEFORE INSERT ON audit_events FOR EACH ROW
     EXECUTE FUNCTION reject_retrieval_cancel_audit()`,
  );
  try {
    await operation();
  } finally {
    await context.adminPool.query(
      `DROP TRIGGER reject_retrieval_cancel_audit ON audit_events;
       DROP FUNCTION reject_retrieval_cancel_audit()`,
    );
  }
}

describe("VAL-006H cancellation safety", () => {
  it("composes duplicate and concurrent first requests into one lifecycle", async () => {
    const parked = await context.createParkedFixture();
    const path = "/v1/guest/session/request-retrieval";
    const concurrent = await Promise.all([
      context.guestPost(parked.guestToken, path),
      context.guestPost(parked.guestToken, path),
    ]);
    expect(concurrent.map((response) => response.status)).toEqual([200, 200]);
    expect(await context.guestPost(parked.guestToken, path)).toMatchObject({
      status: 200,
      body: { state: "REQUESTED" },
    });
    const lifecycle = await context.lifecycleRows(parked.sessionId);
    expect(lifecycle.requests).toHaveLength(1);
    expect(lifecycle.tasks).toHaveLength(1);
    const taskId = lifecycle.tasks[0]?.id;
    expect(typeof taskId).toBe("string");
    expect(
      await context.eventTypes("dispatch_events", taskId as string),
    ).toEqual(["QUEUED"]);
    const requestedAudit = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_REQUESTED'`,
      [parked.sessionId],
    );
    expect(requestedAudit.rows[0]?.count).toBe(1);
  });

  it("serializes concurrent cancel presses to one cancellation history", async () => {
    const fixture = await context.requestRetrieval(
      await context.createParkedFixture(),
    );
    const responses = await Promise.all([
      context.cancel(fixture),
      context.cancel(fixture),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const effects = await context.cancellationEffects(fixture);
    expect(effects.projection).toMatchObject({
      request_status: "CANCELLED",
      session_state: "PARKED",
      task_status: "CANCELLED",
    });
    expect(
      effects.dispatch.filter((event) => event.event_type === "CANCELLED"),
    ).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
  });

  it("serializes cancel against start Retrieval without a partial winner", async () => {
    let fixture = await context.requestRetrieval(
      await context.createParkedFixture(),
    );
    fixture = await context.assign(fixture, true);
    const [cancelled, started] = await Promise.all([
      context.cancel(fixture),
      context.staffPost(
        fixture.accessToken,
        `/v1/staff/valet-sessions/${fixture.sessionId}/start-retrieval`,
        {
          expectedSessionVersion: fixture.sessionVersion,
          expectedTaskVersion: fixture.taskVersion,
        },
      ),
    ]);
    expect(
      [cancelled, started].filter((result) => result.status === 200),
    ).toHaveLength(1);
    const effects = await context.cancellationEffects(fixture);
    if (effects.projection.session_state === "PARKED") {
      expect(cancelled.status).toBe(200);
      expect([404, 409]).toContain(started.status);
      expect(effects.projection).toMatchObject({
        request_status: "CANCELLED",
        task_status: "CANCELLED",
      });
      expect(effects.dispatch.at(-1)?.event_type).toBe("CANCELLED");
    } else {
      expect(started.status).toBe(200);
      expect(cancelled.status).toBe(409);
      expect(effects.projection).toMatchObject({
        request_status: "ACCEPTED",
        session_state: "RETRIEVING",
        task_status: "IN_PROGRESS",
      });
      expect(effects.dispatch.at(-1)?.event_type).toBe("IN_PROGRESS");
      expect(effects.audits).toHaveLength(0);
    }
  });

  it("rolls back every domain effect when the audit append fails", async () => {
    const fixture = await context.requestRetrieval(
      await context.createParkedFixture(),
    );
    const before = await context.cancellationEffects(fixture);
    await rejectCancellationAudit(async () => {
      const response = await context.cancel(fixture);
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
    });
    expect(await context.cancellationEffects(fixture)).toEqual(before);
  });

  it("enforces strict transport, bearer validity, expiry, and pre-start state", async () => {
    const parked = await context.createParkedFixture();
    const fixture = await context.requestRetrieval(parked);
    for (const result of [
      await context.guestPost(
        fixture.guestToken,
        "/v1/guest/session/cancel-retrieval?unexpected=true",
      ),
      await context.guestPost(
        fixture.guestToken,
        "/v1/guest/session/cancel-retrieval",
        { valetSessionId: fixture.sessionId },
      ),
      await context.guestPost(
        fixture.guestToken,
        "/v1/guest/session/cancel-retrieval",
        null,
      ),
      await context.guestPost(
        fixture.guestToken,
        "/v1/guest/session/request-retrieval",
        null,
      ),
    ]) {
      expect(result).toMatchObject({
        status: 400,
        body: { code: "REQUEST_INVALID" },
      });
      expect(result.headers.get("cache-control")).toBe("no-store");
    }
    const invalid = await context.guestPost(
      randomBytes(32).toString("base64url"),
      "/v1/guest/session/cancel-retrieval",
    );
    expect(invalid).toMatchObject({
      status: 401,
      body: { code: "GUEST_ACCESS_INVALID" },
    });
    expect(invalid.headers.get("cache-control")).toBe("no-store");

    await context.adminPool.query(
      `UPDATE valet_sessions SET customer_access_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [fixture.sessionId],
    );
    const expired = await context.cancel(fixture);
    expect(expired).toMatchObject({
      status: 401,
      body: { code: "GUEST_ACCESS_INVALID" },
    });
    expect(expired.headers.get("cache-control")).toBe("no-store");

    const active = await context.requestRetrieval(
      await context.createParkedFixture(),
    );
    const owned = await context.assign(active, true);
    const started = await context.staffPost(
      owned.accessToken,
      `/v1/staff/valet-sessions/${owned.sessionId}/start-retrieval`,
      {
        expectedSessionVersion: owned.sessionVersion,
        expectedTaskVersion: owned.taskVersion,
      },
    );
    expect(started.status).toBe(200);
    expect(await context.cancel(owned)).toMatchObject({
      status: 409,
      body: { code: "INVALID_STATE_TRANSITION" },
    });
  });
});
