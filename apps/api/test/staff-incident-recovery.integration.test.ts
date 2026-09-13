import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IncidentRecoveryResponse } from "@valet/contracts";
import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";
import { createReportIncidentCommandExecutor } from "../src/modules/incidents/incident-reporting-command";
import { createIncidentRecoveryQueryExecutor } from "../src/modules/incidents/incident-recovery-query";

const protocolHeaders = {
  "Valet-Incident-Submission-Protocol": "actor-bound-intent-v1",
};
const recoveryId = () => {
  const value = randomUUID();
  return `${value.slice(0, 14)}8${value.slice(15)}`;
};
const reportBody = (incidentId: string) => ({
  description: "Sensitive recovery integration canary",
  incidentId,
  severity: "HIGH" as const,
  type: "EMPLOYEE_SAFETY" as const,
});

describe("DEC-077 Incident recovery integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => harness.close(), 60_000);

  async function fixture() {
    const established = await harness.fixtureWithToken();
    const session = await harness.createSession(established.fixture);
    return { ...established, ...session };
  }

  const intentPath = (sessionId: string, incidentId: string) =>
    `/v1/staff/valet-sessions/${sessionId}/incidents/${incidentId}/recovery-intent`;
  const recoveryPath = (sessionId: string, incidentId: string) =>
    `/v1/staff/valet-sessions/${sessionId}/incidents/${incidentId}/recovery`;

  it("reserves before POST, recovers FOUND, and audits only the Incident once", async () => {
    const setup = await fixture();
    const incidentId = recoveryId();
    const reserved = await harness.request<IncidentRecoveryResponse>(
      "POST",
      intentPath(setup.sessionId, incidentId),
      { body: {}, headers: protocolHeaders, token: setup.token },
    );
    expect(reserved.status).toBe(200);
    expect(reserved.body).toMatchObject({ incidentId, outcome: "RESERVED" });

    const pending = await harness.request<IncidentRecoveryResponse>(
      "GET",
      recoveryPath(setup.sessionId, incidentId),
      { token: setup.token },
    );
    expect(pending.body.outcome).toBe("RESERVED");

    const opened = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${setup.sessionId}/incidents`,
      {
        body: reportBody(incidentId),
        headers: protocolHeaders,
        token: setup.token,
      },
    );
    expect(opened.status).toBe(200);

    const found = await harness.request<IncidentRecoveryResponse>(
      "GET",
      recoveryPath(setup.sessionId, incidentId),
      { token: setup.token },
    );
    expect(found.body).toMatchObject({
      outcome: "FOUND",
      report: { incidentId },
    });
    const counts = await harness.context.adminPool.query<{
      audits: number;
      incidents: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM incidents WHERE id = $1) AS incidents,
         (SELECT count(*)::int FROM audit_events
          WHERE entity_id = $1 AND event_type = 'INCIDENT_OPENED') AS audits`,
      [incidentId],
    );
    expect(counts.rows[0]).toEqual({ audits: 1, incidents: 1 });
  });

  it("rejects protocol downgrade and preserves legacy v4", async () => {
    const setup = await fixture();
    const id = recoveryId();
    const unreserved = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${setup.sessionId}/incidents`,
      { body: reportBody(id), headers: protocolHeaders, token: setup.token },
    );
    expect(unreserved.status).toBe(409);
    const missingHeader = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${setup.sessionId}/incidents`,
      { body: reportBody(recoveryId()), token: setup.token },
    );
    expect(missingHeader.status).toBe(400);
    const v4 = randomUUID();
    const wrongClass = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${setup.sessionId}/incidents`,
      { body: reportBody(v4), headers: protocolHeaders, token: setup.token },
    );
    expect(wrongClass.status).toBe(400);
    const legacy = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${setup.sessionId}/incidents`,
      { body: reportBody(v4), token: setup.token },
    );
    expect(legacy.status).toBe(200);
  });

  it("allows only the original membership to read or retire", async () => {
    const setup = await fixture();
    const incidentId = recoveryId();
    await harness.request("POST", intentPath(setup.sessionId, incidentId), {
      body: {},
      headers: protocolHeaders,
      token: setup.token,
    });
    const other = await harness.addMember(
      setup.fixture,
      "VALET_SUPERVISOR",
      true,
    );
    const otherToken = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${otherToken}`, other.userId);
    for (const suffix of ["recovery", "recovery-intent/retire"]) {
      const denied = await harness.request(
        suffix === "recovery" ? "GET" : "POST",
        `/v1/staff/valet-sessions/${setup.sessionId}/incidents/${incidentId}/${suffix}`,
        suffix === "recovery"
          ? { token: otherToken }
          : { body: {}, headers: protocolHeaders, token: otherToken },
      );
      expect(denied.status).toBe(404);
    }
  });

  it("retirement is definitive and defeats a delayed POST", async () => {
    const setup = await fixture();
    const incidentId = recoveryId();
    await harness.request("POST", intentPath(setup.sessionId, incidentId), {
      body: {},
      headers: protocolHeaders,
      token: setup.token,
    });
    const retired = await harness.request<IncidentRecoveryResponse>(
      "POST",
      `${intentPath(setup.sessionId, incidentId)}/retire`,
      { body: {}, headers: protocolHeaders, token: setup.token },
    );
    expect(retired.body.outcome).toBe("RETIRED");
    const delayed = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${setup.sessionId}/incidents`,
      {
        body: reportBody(incidentId),
        headers: protocolHeaders,
        token: setup.token,
      },
    );
    expect(delayed.status).toBe(409);
    const rows = await harness.context.adminPool.query<{
      audits: number;
      incidents: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM incidents WHERE id=$1) AS incidents,
         (SELECT count(*)::int FROM audit_events
          WHERE entity_id=$1 AND event_type='INCIDENT_OPENED') AS audits`,
      [incidentId],
    );
    expect(rows.rows[0]).toEqual({ audits: 0, incidents: 0 });
  });

  it("recovers after Shift end and session completion without reopening creation", async () => {
    const setup = await fixture();
    const incidentId = recoveryId();
    await harness.request("POST", intentPath(setup.sessionId, incidentId), {
      body: {},
      headers: protocolHeaders,
      token: setup.token,
    });
    await harness.context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp()
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [setup.fixture.membershipId],
    );
    await harness.context.adminPool.query(
      `UPDATE valet_sessions SET state = 'COMPLETED', completed_at = clock_timestamp(),
         completed_by_membership_id = $2 WHERE id = $1`,
      [setup.sessionId, setup.fixture.membershipId],
    );
    const recovered = await harness.request<IncidentRecoveryResponse>(
      "GET",
      recoveryPath(setup.sessionId, incidentId),
      { token: setup.token },
    );
    expect(recovered.body.outcome).toBe("RESERVED");
    const create = await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${setup.sessionId}/incidents`,
      { body: reportBody(randomUUID()), token: setup.token },
    );
    expect(create.status).toBe(404);
  });

  it("uses authoritative strict-before expiry at 14:59 and rejects at 15:00", async () => {
    const beforeExpiry = await fixture();
    const acceptedId = recoveryId();
    await harness.request(
      "POST",
      intentPath(beforeExpiry.sessionId, acceptedId),
      {
        body: {},
        headers: protocolHeaders,
        token: beforeExpiry.token,
      },
    );
    const acceptedTime = await intentCreatedAt(
      beforeExpiry.fixture.organizationId,
      acceptedId,
    );
    const acceptedExecutor = createReportIncidentCommandExecutor(
      harness.context.runtimePool,
      new Date(acceptedTime.getTime() + 14 * 60 * 1000 + 59 * 1000),
    );
    await expect(
      acceptedExecutor({
        ...reportBody(acceptedId),
        authenticatedUserId: beforeExpiry.fixture.userId,
        recoveryProtocol: true,
        sessionId: beforeExpiry.sessionId,
      }),
    ).resolves.toMatchObject({ incidentId: acceptedId });

    const atExpiry = await fixture();
    const rejectedId = recoveryId();
    await harness.request("POST", intentPath(atExpiry.sessionId, rejectedId), {
      body: {},
      headers: protocolHeaders,
      token: atExpiry.token,
    });
    const rejectedTime = await intentCreatedAt(
      atExpiry.fixture.organizationId,
      rejectedId,
    );
    const exactBoundary = new Date(rejectedTime.getTime() + 15 * 60 * 1000);
    const rejectedExecutor = createReportIncidentCommandExecutor(
      harness.context.runtimePool,
      exactBoundary,
    );
    await expect(
      rejectedExecutor({
        ...reportBody(rejectedId),
        authenticatedUserId: atExpiry.fixture.userId,
        recoveryProtocol: true,
        sessionId: atExpiry.sessionId,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const recovery = createIncidentRecoveryQueryExecutor(
      harness.context.runtimePool,
      exactBoundary,
    );
    await expect(
      recovery({
        authenticatedUserId: atExpiry.fixture.userId,
        incidentId: rejectedId,
        sessionId: atExpiry.sessionId,
      }),
    ).resolves.toMatchObject({ outcome: "RETIRED" });
  });

  async function intentCreatedAt(organizationId: string, incidentId: string) {
    const result = await harness.context.adminPool.query<{ created_at: Date }>(
      `SELECT created_at FROM incident_recovery_intents
       WHERE organization_id = $1 AND incident_id = $2`,
      [organizationId, incidentId],
    );
    return result.rows[0]!.created_at;
  }
});
