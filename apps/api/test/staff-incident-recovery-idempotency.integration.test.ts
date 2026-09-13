import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IncidentRecoveryResponse } from "@valet/contracts";
import { createReportIncidentCommandExecutor } from "../src/modules/incidents/incident-reporting-command";
import { createIncidentRecoveryQueryExecutor } from "../src/modules/incidents/incident-recovery-query";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

const headers = {
  "Valet-Incident-Submission-Protocol": "actor-bound-intent-v1",
};
const recoveryId = () => {
  const value = randomUUID();
  return `${value.slice(0, 14)}8${value.slice(15)}`;
};

describe("DEC-077 exact operation identity", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => harness.close(), 60_000);

  async function createFixture() {
    const authenticated = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(authenticated.fixture);
    return { ...authenticated, sessionId };
  }

  async function reserveAndReport(
    sessionId: string,
    token: string,
    incidentId: string,
  ) {
    const root = `/v1/staff/valet-sessions/${sessionId}/incidents`;
    await harness.request("POST", `${root}/${incidentId}/recovery-intent`, {
      body: {},
      headers,
      token,
    });
    const body = {
      description: "repeatable sensitive canary",
      incidentId,
      severity: "MEDIUM" as const,
      type: "CUSTOMER_COMPLAINT" as const,
    };
    const response = await harness.request("POST", root, {
      body,
      headers,
      token,
    });
    expect(response.status).toBe(200);
    return { body, root };
  }

  it("returns the original exact retry and conflicts changed content", async () => {
    const setup = await createFixture();
    const incidentId = recoveryId();
    const operation = await reserveAndReport(
      setup.sessionId,
      setup.token,
      incidentId,
    );
    const retry = await harness.request("POST", operation.root, {
      body: operation.body,
      headers,
      token: setup.token,
    });
    expect(retry).toMatchObject({ body: { incidentId }, status: 200 });
    const changed = await harness.request("POST", operation.root, {
      body: { ...operation.body, description: "changed after ambiguity" },
      headers,
      token: setup.token,
    });
    expect(changed.status).toBe(409);
    const count = await harness.context.adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events
       WHERE entity_id=$1 AND event_type='INCIDENT_OPENED'`,
      [incidentId],
    );
    expect(count.rows[0]!.count).toBe(1);
    const stored = await harness.context.adminPool.query<{ created_at: Date }>(
      `SELECT created_at FROM incident_recovery_intents
       WHERE organization_id=$1 AND incident_id=$2`,
      [setup.fixture.organizationId, incidentId],
    );
    await expect(
      createReportIncidentCommandExecutor(
        harness.context.runtimePool,
        new Date(stored.rows[0]!.created_at.getTime() + 30 * 86_400_000),
      )({
        ...operation.body,
        authenticatedUserId: setup.fixture.userId,
        recoveryProtocol: true,
        sessionId: setup.sessionId,
      }),
    ).resolves.toMatchObject({ incidentId });
    await harness.context.adminPool.query(
      `UPDATE shifts SET status='ENDED', ended_at=clock_timestamp()
       WHERE membership_id=$1 AND status='ACTIVE'`,
      [setup.fixture.membershipId],
    );
    await harness.context.adminPool.query(
      `UPDATE valet_sessions SET state='COMPLETED', completed_at=clock_timestamp(),
         completed_by_membership_id=$1 WHERE id=$2`,
      [setup.fixture.membershipId, setup.sessionId],
    );
    await expect(
      createIncidentRecoveryQueryExecutor(
        harness.context.runtimePool,
        new Date(stored.rows[0]!.created_at.getTime() + 30 * 86_400_000),
      )({
        authenticatedUserId: setup.fixture.userId,
        incidentId,
        sessionId: setup.sessionId,
      }),
    ).resolves.toMatchObject({ outcome: "FOUND", report: { incidentId } });
  });

  it("recovers only the requested ID when one session has repeated content", async () => {
    const setup = await createFixture();
    const firstId = recoveryId();
    const secondId = recoveryId();
    await reserveAndReport(setup.sessionId, setup.token, firstId);
    await reserveAndReport(setup.sessionId, setup.token, secondId);
    for (const incidentId of [firstId, secondId]) {
      const result = await harness.request<IncidentRecoveryResponse>(
        "GET",
        `${incidentRoot(setup.sessionId)}/${incidentId}/recovery`,
        { token: setup.token },
      );
      expect(result.body).toMatchObject({
        outcome: "FOUND",
        report: { incidentId },
      });
    }
  });

  it("keeps an expired reservation terminal and retained far later", async () => {
    const setup = await createFixture();
    const incidentId = recoveryId();
    const root = incidentRoot(setup.sessionId);
    await harness.request("POST", `${root}/${incidentId}/recovery-intent`, {
      body: {},
      headers,
      token: setup.token,
    });
    const stored = await harness.context.adminPool.query<{ created_at: Date }>(
      `SELECT created_at FROM incident_recovery_intents
       WHERE organization_id=$1 AND incident_id=$2`,
      [setup.fixture.organizationId, incidentId],
    );
    const farLater = new Date(
      stored.rows[0]!.created_at.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const report = createReportIncidentCommandExecutor(
      harness.context.runtimePool,
      farLater,
    );
    await expect(
      report({
        authenticatedUserId: setup.fixture.userId,
        description: "late payload",
        incidentId,
        recoveryProtocol: true,
        sessionId: setup.sessionId,
        severity: "LOW",
        type: "OTHER",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      createIncidentRecoveryQueryExecutor(
        harness.context.runtimePool,
        farLater,
      )({
        authenticatedUserId: setup.fixture.userId,
        incidentId,
        sessionId: setup.sessionId,
      }),
    ).resolves.toMatchObject({ outcome: "RETIRED" });
    const tombstone = await harness.context.adminPool.query(
      `SELECT 1 FROM incident_recovery_intents
       WHERE organization_id=$1 AND incident_id=$2`,
      [setup.fixture.organizationId, incidentId],
    );
    expect(tombstone.rowCount).toBe(1);
  });

  it("reserves idempotently for the exact actor, scope, session and ID", async () => {
    const setup = await createFixture();
    const incidentId = recoveryId();
    const path = `${incidentRoot(setup.sessionId)}/${incidentId}/recovery-intent`;
    const first = await harness.request("POST", path, {
      body: {},
      headers,
      token: setup.token,
    });
    const second = await harness.request("POST", path, {
      body: {},
      headers,
      token: setup.token,
    });
    expect(second).toEqual(first);
    const count = await harness.context.adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM incident_recovery_intents
       WHERE organization_id=$1 AND incident_id=$2`,
      [setup.fixture.organizationId, incidentId],
    );
    expect(count.rows[0]!.count).toBe(1);
  });

  it("enforces strict recovery route protocol, UUID and empty input", async () => {
    const setup = await createFixture();
    const incidentId = recoveryId();
    const root = incidentRoot(setup.sessionId);
    for (const send of [
      () =>
        harness.request("POST", `${root}/${incidentId}/recovery-intent`, {
          body: {},
          token: setup.token,
        }),
      () =>
        harness.request(
          "POST",
          `${root}/${incidentId}/recovery-intent?extra=1`,
          { body: {}, headers, token: setup.token },
        ),
      () =>
        harness.request("POST", `${root}/${incidentId}/recovery-intent`, {
          body: { description: "forbidden" },
          headers,
          token: setup.token,
        }),
      () =>
        harness.request("GET", `${root}/${randomUUID()}/recovery`, {
          token: setup.token,
        }),
    ]) {
      await expect(send()).resolves.toMatchObject({ status: 400 });
    }
    await harness.request("POST", `${root}/${incidentId}/recovery-intent`, {
      body: {},
      headers,
      token: setup.token,
    });
    const missingRetireHeader = await harness.request(
      "POST",
      `${root}/${incidentId}/recovery-intent/retire`,
      { body: {}, token: setup.token },
    );
    expect(missingRetireHeader.status).toBe(400);
  });
});

function incidentRoot(sessionId: string): string {
  return `/v1/staff/valet-sessions/${sessionId}/incidents`;
}
