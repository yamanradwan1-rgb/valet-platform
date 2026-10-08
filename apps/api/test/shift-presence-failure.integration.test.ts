import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  OPERATION_OBSERVER,
  type OperationObserver,
} from "../src/common/observability/operation-observability";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";
import { disconnectBeforePresenceCommit } from "./shift-presence-disconnect-test-helper";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";

const db = new PresenceServerTestContext("presence-failures");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("actual disconnect, cash/open-work/audit rollback and minimized telemetry", () => {
  it("a real PostgreSQL connection loss before COMMIT leaves no ghost Start or result", async () => {
    const f = await db.createFixture();
    await db.policy(f, "REQUIRE");
    await db.zone(f);
    const session = await db.session(f.userId);
    const challenge = await db.challenge(f, session.context);
    const interrupted = await presenceHttp(
      db,
      disconnectBeforePresenceCommit(db),
    );
    try {
      const response = await interrupted.request(
        "POST",
        "/v1/staff/shifts/start",
        session.token,
        { targetLocationId: f.locationId, presence: db.measured(challenge) },
      );
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("ANTI_ABUSE_UNAVAILABLE");
      expect(await db.facts(f)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
      expect(
        await db.presence.status(session.context, challenge.operationId),
      ).toMatchObject({ state: "PENDING" });
      expect(
        (
          await interrupted.request(
            "GET",
            `/v1/staff/shifts/presence/operations/${challenge.operationId}`,
            session.token,
          )
        ).status,
      ).toBe(503);
      expect(await db.facts(f)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
    } finally {
      await interrupted.app.close();
    }
  });
  it.each(["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] as const)(
    "canonical %s work blocks End before evidence consumption",
    async (state) => {
      const f = await db.createFixture();
      const shift = await db.start(f);
      await db.policy(f, "OFF", "REQUIRE");
      await db.zone(f);
      const session = await db.session(f.userId);
      const challenge = await db.challenge(f, session.context, shift.shiftId);
      const evidence = db.measured(challenge);
      const vehicle = randomUUID(),
        visit = randomUUID(),
        task = randomUUID();
      await db.adminPool.query(
        `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'Synthetic work',clock_timestamp())`,
        [vehicle, f.organizationId],
      );
      await db.adminPool.query(
        `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,checked_in_by_membership_id,state,
      customer_access_token_hash,customer_access_expires_at,updated_at) VALUES($1,$2,$3,$4,$5,'AWAITING_PARKING',$6,clock_timestamp()+interval '1 hour',clock_timestamp())`,
        [
          visit,
          f.organizationId,
          f.locationId,
          vehicle,
          f.membershipId,
          `disabled:${randomUUID()}`,
        ],
      );
      await db.adminPool.query(
        `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,status,current_assignee_membership_id,updated_at)
      VALUES($1,$2,$3,$4,'PARKING',$5,$6,clock_timestamp())`,
        [task, f.organizationId, f.locationId, visit, state, f.membershipId],
      );
      await expect(
        db.end(f, shift.shiftId, "0", evidence),
      ).rejects.toMatchObject({ code: "OPEN_TASK_HANDOFF_REQUIRED" });
      expect(
        await db.presence.status(session.context, challenge.operationId),
      ).toMatchObject({ state: "PENDING" });
      expect(
        (
          await db.adminPool.query(
            `SELECT consumed_at FROM shift_presence_challenges WHERE id=$1`,
            [challenge.challengeId],
          )
        ).rows[0].consumed_at,
      ).toBeNull();
      expect(await db.facts(f)).toEqual({
        shifts: 1,
        decisions: 0,
        starts: 1,
        ends: 0,
      });
    },
  );
  it("failed End audit rolls back cash snapshot, Shift, Decision, challenge and result", async () => {
    const f = await db.createFixture();
    const shift = await db.start(f);
    await db.policy(f, "OFF", "REQUIRE");
    await db.zone(f);
    const session = await db.session(f.userId);
    const challenge = await db.challenge(f, session.context, shift.shiftId);
    const evidence = db.measured(challenge);
    const duplicate = (
      await db.adminPool.query(
        `SELECT id FROM audit_events WHERE entity_id=$1 AND event_type='SHIFT_STARTED'`,
        [shift.shiftId],
      )
    ).rows[0].id as string;
    await expect(
      createEndShiftCommandExecutor(db.runtimePool, {
        auditEventIdFactory: () => duplicate,
      })({
        authenticatedUserId: f.userId,
        shiftId: shift.shiftId,
        cashReported: "0",
        presence: evidence,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(
      (
        await db.adminPool.query(
          `SELECT status,cash_expected,cash_reported,cash_reported_at FROM shifts WHERE id=$1`,
          [shift.shiftId],
        )
      ).rows[0],
    ).toEqual({
      status: "ACTIVE",
      cash_expected: null,
      cash_reported: null,
      cash_reported_at: null,
    });
    expect(
      await db.presence.status(session.context, challenge.operationId),
    ).toMatchObject({ state: "PENDING" });
    expect(await db.facts(f)).toEqual({
      shifts: 1,
      decisions: 0,
      starts: 1,
      ends: 0,
    });
  });
  it.each(["DISCONNECT", "MALFORMED"])(
    "lost End %s response recovers immutable cash through exact status",
    async (loss) => {
      const f = await db.createFixture();
      const shift = await db.start(f);
      await db.policy(f, "OFF", "REQUIRE");
      await db.zone(f);
      const session = await db.session(f.userId);
      const challenge = await db.challenge(
        f,
        session.context,
        shift.shiftId,
        "3.5",
      );
      await expect(
        http.request(
          "POST",
          `/v1/staff/shifts/${shift.shiftId}/end`,
          session.token,
          { cashReported: "3.5", presence: db.measured(challenge) },
          loss,
        ),
      ).rejects.toThrow();
      expect(
        (
          await http.request(
            "GET",
            `/v1/staff/shifts/presence/operations/${challenge.operationId}`,
            session.token,
          )
        ).body,
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "COMMITTED",
        result: {
          status: "ENDED",
          cashReconciliation: { cashReported: "3.500", currency: "JOD" },
        },
      });
      expect(await db.facts(f)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: 1,
      });
    },
  );
  it("employee coordinates are absent from Decision, audit, observer/log input and responses", async () => {
    const f = await db.createFixture();
    await db.policy(f, "REQUIRE");
    await db.zone(f);
    const session = await db.session(f.userId);
    const challenge = await db.challenge(f, session.context);
    const observer = http.app.get<OperationObserver>(OPERATION_OBSERVER);
    const capture = vi.spyOn(observer, "observe");
    try {
      const response = await http.request(
        "POST",
        "/v1/staff/shifts/start",
        session.token,
        {
          targetLocationId: f.locationId,
          presence: db.measured(challenge, 31.95001),
        },
      );
      expect(response.status).toBe(200);
      const durable = await db.adminPool.query(
        `SELECT to_jsonb(d) AS facts FROM shift_presence_decisions d WHERE user_id=$1`,
        [f.userId],
      );
      const audit = await db.adminPool.query(
        `SELECT metadata_json FROM audit_events WHERE organization_id=$1`,
        [f.organizationId],
      );
      for (const payload of [
        durable.rows,
        audit.rows,
        capture.mock.calls,
        response.body,
      ]) {
        const encoded = JSON.stringify(payload);
        for (const forbidden of [
          "31.95001",
          "latitude",
          "longitude",
          "capturedAt",
          "clientSampleId",
          "measurement",
        ])
          expect(encoded).not.toContain(forbidden);
      }
      expect(capture).toHaveBeenCalled();
    } finally {
      capture.mockRestore();
    }
  });
  it.each(["REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
    "old Web/version/unsupported headers cannot bypass %s",
    async (mode) => {
      const f = await db.createFixture();
      await db.policy(f, mode);
      const session = await db.session(f.userId);
      const response = await http.request(
        "POST",
        "/v1/staff/shifts/start",
        session.token,
        { targetLocationId: f.locationId },
        undefined,
        {
          "user-agent": "legacy-employee-web",
          "x-client-version": "0",
          "x-device-support": "false",
        },
      );
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: "PRESENCE_REQUIRED" });
      expect(await db.facts(f)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
    },
  );
});
