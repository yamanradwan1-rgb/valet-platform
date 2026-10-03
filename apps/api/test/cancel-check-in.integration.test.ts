import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";
import { createCancelCheckInCommandExecutor } from "../src/modules/valet-sessions/cancel-check-in-command";
import { createCancelCheckInStatusQuery } from "../src/modules/valet-sessions/cancel-check-in-status-query";
import { createCompleteCheckInCommandExecutor } from "../src/modules/valet-sessions/complete-check-in-command";

describe("Check-In cancellation with runtime PostgreSQL privileges", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);
  async function target(condition = false) {
    const { fixture } = await harness.fixtureWithToken();
    const { sessionId, vehicleId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: condition ? new Date() : null,
    });
    const shift = await harness.context.adminPool.query<{ id: string }>(
      "SELECT id FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'",
      [fixture.membershipId],
    );
    return {
      fixture,
      vehicleId,
      input: {
        authenticatedUserId: fixture.userId,
        sessionId,
        expectedVersion: 1,
        expectedShiftId: shift.rows[0]!.id,
      },
    };
  }
  async function facts(sessionId: string) {
    const row = await harness.context.adminPool.query(
      "SELECT * FROM valet_sessions WHERE id = $1",
      [sessionId],
    );
    const events = await harness.context.adminPool.query(
      "SELECT event_type, metadata_json FROM audit_events WHERE valet_session_id = $1 ORDER BY id",
      [sessionId],
    );
    return { session: row.rows[0], events: events.rows };
  }
  it("atomically cancels, retains condition/credentials/history, converges and frees active identity", async () => {
    const { fixture, vehicleId, input } = await target(true);
    const before = await facts(input.sessionId);
    const execute = createCancelCheckInCommandExecutor(
      harness.context.runtimePool,
    );
    expect(await execute(input)).toEqual({
      sessionId: input.sessionId,
      locationId: fixture.locationId,
      state: "CANCELLED",
      version: 2,
    });
    expect(await execute(input)).toMatchObject({
      state: "CANCELLED",
      version: 2,
    });
    const after = await facts(input.sessionId);
    for (const column of [
      "customer_access_token_hash",
      "customer_access_expires_at",
      "customer_access_revoked_at",
      "check_in_condition_completed_at",
      "check_in_condition_completed_by_membership_id",
    ])
      expect(after.session[column]).toEqual(before.session[column]);
    expect(after.session.completed_at).toBeNull();
    expect(after.events).toEqual([
      {
        event_type: "VALET_SESSION_CHECK_IN_CANCELLED",
        metadata_json: {
          fromState: "CHECKING_IN",
          toState: "CANCELLED",
          fromVersion: 1,
          toVersion: 2,
        },
      },
    ]);
    const auditScope = await harness.context.adminPool.query(
      `SELECT
      a.organization_id=s.organization_id AND a.location_id=s.location_id
      AND a.actor_membership_id=s.checked_in_by_membership_id AND a.actor_type='MEMBERSHIP'
      AND a.entity_type='ValetSession' AND a.entity_id=s.id
      AND a.occurred_at=s.updated_at AS valid
      FROM audit_events a JOIN valet_sessions s ON s.id=a.valet_session_id
      WHERE s.id=$1 AND a.event_type='VALET_SESSION_CHECK_IN_CANCELLED'`,
      [input.sessionId],
    );
    expect(auditScope.rows).toEqual([{ valid: true }]);
    expect(
      await createCancelCheckInStatusQuery(harness.context.runtimePool)(input),
    ).toMatchObject({ state: "CANCELLED", version: 2 });
    await expect(
      harness.createSession(fixture, { vehicleId }),
    ).resolves.toMatchObject({ vehicleId });
  });
  it("rolls back state/version/time when audit append fails", async () => {
    const { input } = await target();
    const before = await facts(input.sessionId);
    await expect(
      createCancelCheckInCommandExecutor(harness.context.runtimePool, {
        auditEventIdFactory: () => "invalid-uuid",
      })(input),
    ).rejects.toThrow();
    expect(await facts(input.sessionId)).toEqual(before);
  });
  it("denies other employee, other supervisor, stale Shift, stale version and progressed state without side effects", async () => {
    const { fixture, input } = await target();
    const before = await facts(input.sessionId);
    for (const role of ["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const) {
      const other = await harness.addMember(fixture, role);
      await expect(
        createCancelCheckInCommandExecutor(harness.context.runtimePool)({
          ...input,
          authenticatedUserId: other.userId,
        }),
      ).rejects.toMatchObject({ code: "TENANT_ACCESS_DENIED" });
    }
    await expect(
      createCancelCheckInCommandExecutor(harness.context.runtimePool)({
        ...input,
        expectedShiftId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    await expect(
      createCancelCheckInCommandExecutor(harness.context.runtimePool)({
        ...input,
        expectedVersion: 9,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await facts(input.sessionId)).toEqual(before);
    await harness.context.adminPool.query(
      "UPDATE valet_sessions SET state = 'AWAITING_PARKING' WHERE id = $1",
      [input.sessionId],
    );
    const progressed = await facts(input.sessionId);
    await expect(
      createCancelCheckInCommandExecutor(harness.context.runtimePool)(input),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(await facts(input.sessionId)).toEqual(progressed);
  });
  it("denies malformed custody and Task history, including incoherent CANCELLED convergence", async () => {
    const { fixture, input } = await target();
    await harness.createTask(fixture, input.sessionId);
    await expect(
      createCancelCheckInCommandExecutor(harness.context.runtimePool)(input),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const other = await target();
    await harness.context.adminPool.query(
      "UPDATE valet_sessions SET state = 'CANCELLED' WHERE id = $1",
      [other.input.sessionId],
    );
    await expect(
      createCancelCheckInCommandExecutor(harness.context.runtimePool)(
        other.input,
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(
      harness.context.adminPool.query(
        "UPDATE valet_sessions SET completed_at = clock_timestamp() WHERE id = $1",
        [other.input.sessionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("cannot complete after cancellation", async () => {
    const { input } = await target(true);
    await createCancelCheckInCommandExecutor(harness.context.runtimePool)(
      input,
    );
    await expect(
      createCompleteCheckInCommandExecutor(harness.context.runtimePool)({
        authenticatedUserId: input.authenticatedUserId,
        valetSessionId: input.sessionId,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
  it("permits self-owned Supervisor cancellation and conceals foreign tenant / Location on first and terminal reads", async () => {
    const { fixture } = await harness.fixtureWithToken({
      role: "VALET_SUPERVISOR",
    });
    const { sessionId } = await harness.createSession(fixture);
    const shift = await harness.context.adminPool.query(
      "SELECT id FROM shifts WHERE membership_id=$1",
      [fixture.membershipId],
    );
    const input = {
      authenticatedUserId: fixture.userId,
      sessionId,
      expectedVersion: 1,
      expectedShiftId: shift.rows[0].id as string,
    };
    const foreign = await harness.fixtureWithToken();
    const elsewhere = await harness.addMember(fixture, "VALET_EMPLOYEE", false);
    const otherLocation = randomUUID();
    await harness.context.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [elsewhere.membershipId],
    );
    await harness.context.adminPool.query(
      `INSERT INTO locations (id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
      SELECT $1,organization_id,'Other Location','OTHER255',address_text,timezone,currency,'ACTIVE',now() FROM locations WHERE id=$2`,
      [otherLocation, fixture.locationId],
    );
    await harness.context.adminPool.query(
      "INSERT INTO membership_location_access (organization_id,membership_id,location_id) VALUES($1,$2,$3)",
      [fixture.organizationId, elsewhere.membershipId, otherLocation],
    );
    await harness.context.adminPool.query(
      "INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at) VALUES($1,$2,$3,$4,'ACTIVE',now())",
      [
        randomUUID(),
        fixture.organizationId,
        otherLocation,
        elsewhere.membershipId,
      ],
    );
    const execute = createCancelCheckInCommandExecutor(
      harness.context.runtimePool,
    );
    for (const terminal of [false, true]) {
      if (terminal) expect((await execute(input)).state).toBe("CANCELLED");
      const before = await facts(sessionId);
      for (const actor of [foreign.fixture, elsewhere]) {
        const substituted = { ...input, authenticatedUserId: actor.userId };
        await expect(execute(substituted)).rejects.toMatchObject({
          code:
            actor === foreign.fixture
              ? "TENANT_ACCESS_DENIED"
              : "LOCATION_ACCESS_DENIED",
        });
        await expect(
          createCancelCheckInStatusQuery(harness.context.runtimePool)(
            substituted,
          ),
        ).rejects.toMatchObject({
          code:
            actor === foreign.fixture
              ? "TENANT_ACCESS_DENIED"
              : "LOCATION_ACCESS_DENIED",
        });
      }
      expect(await facts(sessionId)).toEqual(before);
    }
  });
  it("does not grant Company Admin or Location Manager a self-owned Cancel or status operation", async () => {
    for (const role of ["ORG_ADMIN", "LOCATION_MANAGER"] as const) {
      const { fixture } = await harness.fixtureWithToken({ role });
      const { sessionId } = await harness.createSession(fixture);
      const shift = await harness.context.adminPool.query(
        "SELECT id FROM shifts WHERE membership_id=$1",
        [fixture.membershipId],
      );
      const input = {
        authenticatedUserId: fixture.userId,
        sessionId,
        expectedVersion: 1,
        expectedShiftId: shift.rows[0].id as string,
      };
      const before = await facts(sessionId);
      await expect(
        createCancelCheckInCommandExecutor(harness.context.runtimePool)(input),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(
        createCancelCheckInStatusQuery(harness.context.runtimePool)(input),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      expect(await facts(sessionId)).toEqual(before);
    }
  });
});
