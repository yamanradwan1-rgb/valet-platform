import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IncidentRecoveryResponse } from "@valet/contracts";
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

describe("DEC-077 PostgreSQL operation-lock visibility", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);
  afterAll(async () => harness.close(), 60_000);

  async function setup() {
    const auth = await harness.fixtureWithToken();
    const session = await harness.createSession(auth.fixture);
    return { ...auth, ...session };
  }

  function recoveryPath(sessionId: string, incidentId: string) {
    return `/v1/staff/valet-sessions/${sessionId}/incidents/${incidentId}/recovery`;
  }

  async function holdOperation(
    client: PoolClient,
    organizationId: string,
    incidentId: string,
  ) {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${organizationId}:incident:${incidentId}`],
    );
  }

  async function waitForAdvisoryWait(minimum = 1) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const waiting = await harness.context.adminPool.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM pg_locks
         WHERE locktype = 'advisory'
           AND NOT granted
           AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      if (waiting.rows[0]!.count >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Recovery query did not wait on the advisory lock.");
  }

  it.each(["COMMIT", "ROLLBACK"] as const)(
    "waits for reservation %s and performs a fresh post-lock read",
    async (transactionOutcome) => {
      const value = await setup();
      const incidentId = recoveryId();
      const writer = await harness.context.adminPool.connect();
      try {
        await holdOperation(writer, value.fixture.organizationId, incidentId);
        await writer.query(
          `INSERT INTO incident_recovery_intents
             (incident_id,organization_id,location_id,valet_session_id,
              reporting_membership_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            incidentId,
            value.fixture.organizationId,
            value.fixture.locationId,
            value.sessionId,
            value.fixture.membershipId,
          ],
        );
        const recovery = harness.request<IncidentRecoveryResponse>(
          "GET",
          recoveryPath(value.sessionId, incidentId),
          { token: value.token },
        );
        await waitForAdvisoryWait();
        await writer.query(transactionOutcome);
        await expect(recovery).resolves.toMatchObject({
          body: {
            outcome: transactionOutcome === "COMMIT" ? "RESERVED" : "UNKNOWN",
          },
          status: 200,
        });
      } finally {
        try {
          await writer.query("ROLLBACK");
        } catch {
          // The requested transaction outcome already ended it.
        }
        writer.release();
      }
    },
    30_000,
  );

  it.each(["COMMIT", "ROLLBACK"] as const)(
    "waits for Incident transaction %s and resolves FOUND or RESERVED",
    async (transactionOutcome) => {
      const value = await setup();
      const incidentId = recoveryId();
      await harness.request(
        "POST",
        `/v1/staff/valet-sessions/${value.sessionId}/incidents/${incidentId}/recovery-intent`,
        { body: {}, headers, token: value.token },
      );
      const writer = await harness.context.adminPool.connect();
      try {
        await holdOperation(writer, value.fixture.organizationId, incidentId);
        await writer.query(
          `INSERT INTO incidents
             (id,organization_id,location_id,valet_session_id,status,severity,
              type,description,reported_by_membership_id,created_at)
           VALUES ($1,$2,$3,$4,'OPEN','LOW','OTHER','race canary',$5,clock_timestamp())`,
          [
            incidentId,
            value.fixture.organizationId,
            value.fixture.locationId,
            value.sessionId,
            value.fixture.membershipId,
          ],
        );
        await writer.query(
          `INSERT INTO audit_events
             (id,organization_id,location_id,valet_session_id,
              actor_membership_id,event_type,entity_type,entity_id,
              metadata_json,occurred_at)
           VALUES ($1,$2,$3,$4,$5,'INCIDENT_OPENED','INCIDENT',$6,'{}',clock_timestamp())`,
          [
            randomUUID(),
            value.fixture.organizationId,
            value.fixture.locationId,
            value.sessionId,
            value.fixture.membershipId,
            incidentId,
          ],
        );
        const recovery = harness.request<IncidentRecoveryResponse>(
          "GET",
          recoveryPath(value.sessionId, incidentId),
          { token: value.token },
        );
        await waitForAdvisoryWait();
        await writer.query(transactionOutcome);
        await expect(recovery).resolves.toMatchObject({
          body: {
            outcome: transactionOutcome === "COMMIT" ? "FOUND" : "RESERVED",
          },
          status: 200,
        });
      } finally {
        try {
          await writer.query("ROLLBACK");
        } catch {
          // The requested transaction outcome already ended it.
        }
        writer.release();
      }
    },
    30_000,
  );

  it.each(["RETIRE_FIRST", "POST_FIRST"] as const)(
    "serializes competing %s recovery mutations",
    async (order) => {
      const value = await setup();
      const incidentId = recoveryId();
      const root = `/v1/staff/valet-sessions/${value.sessionId}/incidents`;
      await harness.request("POST", `${root}/${incidentId}/recovery-intent`, {
        body: {},
        headers,
        token: value.token,
      });
      const writer = await harness.context.adminPool.connect();
      try {
        await holdOperation(writer, value.fixture.organizationId, incidentId);
        const retire = () =>
          harness.request<IncidentRecoveryResponse>(
            "POST",
            `${root}/${incidentId}/recovery-intent/retire`,
            { body: {}, headers, token: value.token },
          );
        const post = () =>
          harness.request("POST", root, {
            body: {
              description: "race payload",
              incidentId,
              severity: "LOW",
              type: "OTHER",
            },
            headers,
            token: value.token,
          });
        const first = order === "RETIRE_FIRST" ? retire() : post();
        await waitForAdvisoryWait();
        const second = order === "RETIRE_FIRST" ? post() : retire();
        await waitForAdvisoryWait(2);
        await writer.query("COMMIT");
        const [firstResult, secondResult] = await Promise.all([first, second]);
        const retireResult =
          order === "RETIRE_FIRST" ? firstResult : secondResult;
        const postResult =
          order === "RETIRE_FIRST" ? secondResult : firstResult;
        expect(retireResult).toMatchObject({
          body: { outcome: order === "RETIRE_FIRST" ? "RETIRED" : "FOUND" },
          status: 200,
        });
        expect(postResult.status).toBe(order === "RETIRE_FIRST" ? 409 : 200);
        const counts = await harness.context.adminPool.query<{
          audits: number;
          incidents: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM incidents WHERE id=$1) AS incidents,
             (SELECT count(*)::int FROM audit_events
              WHERE entity_id=$1 AND event_type='INCIDENT_OPENED') AS audits`,
          [incidentId],
        );
        const expected = order === "RETIRE_FIRST" ? 0 : 1;
        expect(counts.rows[0]).toEqual({
          audits: expected,
          incidents: expected,
        });
      } finally {
        try {
          await writer.query("ROLLBACK");
        } catch {
          // COMMIT already ended the gate transaction.
        }
        writer.release();
      }
    },
    30_000,
  );
});
