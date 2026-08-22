import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportIncidentResponse } from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

const incidentInput = (incidentId: string) => ({
  description: "Scratched alloy wheel while parking.",
  incidentId,
  severity: "MEDIUM" as const,
  type: "VEHICLE_DAMAGE" as const,
});

describe("Staff Incident Reporting Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  async function composeReadyFixture() {
    const { fixture } = await harness.fixtureWithToken();
    const ownerA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const retrieverB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenB = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenB}`, retrieverB.userId);

    const supervisor = await harness.addMember(fixture, "VALET_SUPERVISOR", true);
    const tokenS = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenS}`, supervisor.userId);

    const unrelated = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenC = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenC}`, unrelated.userId);

    const wrongLocation = await harness.addMember(
      fixture,
      "VALET_SUPERVISOR",
      true,
    );
    const secondLocation = await harness.context.addLocation(fixture);
    await harness.context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id = $2`,
      [wrongLocation.membershipId, fixture.locationId],
    );
    await harness.context.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, wrongLocation.membershipId, secondLocation],
    );

    const noShift = await harness.addMember(fixture, "VALET_EMPLOYEE", false);
    const tokenN = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenN}`, noShift.userId);

    const zoneId = await harness.createParkingZone(fixture, "ZONE-INC");
    const slotId = await harness.createKeySlot(fixture, "K-INC");
    const vehicleId = await harness.createVehicle(fixture, {
      temporaryDescriptor: "Incident fixture vehicle",
    });
    const { sessionId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
      keySlotId: slotId,
      parkedAt: new Date(),
      parkingSpotId: null,
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "REQUESTED",
      vehicleId,
      version: 5,
    });
    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: ownerA.membershipId,
      status: "COMPLETED",
      taskType: "PARKING",
    });
    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: retrieverB.membershipId,
      status: "ACCEPTED",
      taskType: "RETRIEVAL",
    });
    void wrongLocation;
    return {
      fixture,
      ownerA,
      retrieverB,
      sessionId,
      supervisor,
      tokenB,
      tokenC,
      tokenN,
      tokenS,
      unrelated,
      wrongLocation,
    };
  }

  it("reports, dedupes by stable incidentId, audits once, and leaves aggregates untouched", async () => {
    const composed = await composeReadyFixture();
    const incidentId = randomUUID();

    const before = await harness.context.adminPool.query<{ version: number }>(
      `SELECT version FROM valet_sessions WHERE id = $1`,
      [composed.sessionId],
    );
    const tasksBefore = await harness.context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM tasks WHERE valet_session_id = $1`,
      [composed.sessionId],
    );

    const first = await harness.request<ReportIncidentResponse>(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      { body: incidentInput(incidentId), token: composed.tokenB },
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      incidentId,
      severity: "MEDIUM",
      status: "OPEN",
      type: "VEHICLE_DAMAGE",
    });

    // Exact retry returns the original report.
    const retry = await harness.request<ReportIncidentResponse>(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      { body: incidentInput(incidentId), token: composed.tokenB },
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);

    // Mismatched reuse conflicts.
    const conflict = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      {
        body: { ...incidentInput(incidentId), severity: "HIGH" },
        token: composed.tokenB,
      },
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    // Cross-actor reuse of the SAME payload also conflicts: the stable id is
    // bound to its original reporter and never replayed for another actor.
    const crossActor = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      { body: incidentInput(incidentId), token: composed.tokenS },
    );
    expect(crossActor.status).toBe(409);
    expect(crossActor.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const rows = await harness.context.adminPool.query<{ id: string }>(
      `SELECT id::text AS id FROM incidents
       WHERE organization_id = $1 AND valet_session_id = $2`,
      [composed.fixture.organizationId, composed.sessionId],
    );
    expect(rows.rows).toHaveLength(1);

    const audits = await harness.context.adminPool.query<{
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT metadata_json FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'INCIDENT_OPENED'`,
      [composed.sessionId],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]!.metadata_json).toMatchObject({
      incidentId,
      severity: "MEDIUM",
      status: "OPEN",
      type: "VEHICLE_DAMAGE",
    });
    const rawMetadata = JSON.stringify(audits.rows[0]!.metadata_json);
    expect(rawMetadata).not.toContain("Scratched alloy wheel");

    const after = await harness.context.adminPool.query<{ version: number }>(
      `SELECT version FROM valet_sessions WHERE id = $1`,
      [composed.sessionId],
    );
    expect(after.rows[0]!.version).toBe(before.rows[0]!.version);
    const tasksAfter = await harness.context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM tasks WHERE valet_session_id = $1`,
      [composed.sessionId],
    );
    expect(tasksAfter.rows[0]!.count).toBe(tasksBefore.rows[0]!.count);
  });

  it("allows same-location active-shift supervisor without task ownership and denies unrelated employees", async () => {
    const composed = await composeReadyFixture();

    const asSupervisor = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      {
        body: incidentInput(randomUUID()),
        token: composed.tokenS,
      },
    );
    expect(asSupervisor.status).toBe(200);

    const asUnrelated = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      { body: incidentInput(randomUUID()), token: composed.tokenC },
    );
    expect(asUnrelated.status).toBe(404);
    expect(asUnrelated.body.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("denies wrong-location supervisors and shiftless members non-disclosingly", async () => {
    const composed = await composeReadyFixture();
    const tokenWrong = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenWrong}`, composed.wrongLocation.userId);

    const wrongLocation = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      { body: incidentInput(randomUUID()), token: tokenWrong },
    );
    expect(wrongLocation.status).toBe(404);
    expect(wrongLocation.body.code).toBe("LOCATION_ACCESS_DENIED");

    const noShift = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      { body: incidentInput(randomUUID()), token: composed.tokenN },
    );
    expect(noShift.status).toBe(404);
    expect(["LOCATION_ACCESS_DENIED"]).toContain(noShift.body.code);
  });

  it("conceals cross-tenant sessions and denies COMPLETED sessions", async () => {
    const composed = await composeReadyFixture();
    const foreign = await harness.fixtureWithToken();

    const crossTenant = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${composed.sessionId}/incidents`,
      { body: incidentInput(randomUUID()), token: foreign.token },
    );
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.code).toBe("TENANT_ACCESS_DENIED");

    const { sessionId: completedSession } = await harness.createSession(
      foreign.fixture,
      {
        checkInConditionCompletedAt: new Date(),
        parkedAt: new Date(),
        state: "PARKED",
        version: 9,
      },
    );
    // Terminal fabrication is fine here: this case proves authorization
    // denial, not lifecycle composition.
    await harness.context.adminPool.query(
      `UPDATE valet_sessions
       SET state = 'COMPLETED', completed_at = transaction_timestamp(),
           completed_by_membership_id = $2
       WHERE id = $1`,
      [completedSession, foreign.fixture.membershipId],
    );
    await harness.createTask(foreign.fixture, completedSession, {
      assigneeMembershipId: foreign.fixture.membershipId,
      status: "COMPLETED",
      taskType: "RETRIEVAL",
    });
    const completed = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${completedSession}/incidents`,
      { body: incidentInput(randomUUID()), token: foreign.token },
    );
    expect(completed.status).toBe(404);
    expect(completed.body.code).toBe("TENANT_ACCESS_DENIED");
  });
});
