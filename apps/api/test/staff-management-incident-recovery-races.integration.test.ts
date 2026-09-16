import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { createQueueParkingTaskCommandExecutor } from "../src/modules/dispatch/queue-parking-task-command";
import { createReserveIncidentRecoveryExecutor } from "../src/modules/incidents/incident-recovery-intent-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
let runtimePool: PostgresPool;

function recoveryId(): string {
  const value = randomUUID();
  return `${value.slice(0, 14)}8${value.slice(15)}`;
}

beforeAll(async () => {
  await fixture.start();
  runtimePool = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(async () => {
  await runtimePool?.end();
  await fixture.stop();
}, 60_000);

type Reduction = "DEACTIVATE" | "REVOKE" | "ROLE";

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

async function scenario() {
  const actor = await assuredAdmin();
  const target = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    actor.membership.organizationId,
    target.id,
    "VALET_EMPLOYEE",
  );
  const location = await fixture.addLocation(actor.membership.organizationId);
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [actor.membership.organizationId, membershipId, location.locationId],
  );
  const shift = await createStartShiftCommandExecutor(runtimePool)({
    authenticatedUserId: target.id,
    targetLocationId: location.locationId,
  });
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await fixture.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,transaction_timestamp())`,
    [vehicleId, actor.membership.organizationId, `Intent race ${vehicleId}`],
  );
  await fixture.query(
    `INSERT INTO valet_sessions
       (id,customer_access_token_hash,customer_access_expires_at,
        organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
        version,updated_at)
     VALUES($1,$2,transaction_timestamp()+interval '1 hour',$3,$4,$5,
            'AWAITING_PARKING',$6,1,transaction_timestamp())`,
    [
      sessionId,
      `disabled:intent-race:${randomUUID()}`,
      actor.membership.organizationId,
      location.locationId,
      vehicleId,
      membershipId,
    ],
  );
  await createQueueParkingTaskCommandExecutor(runtimePool)({
    authenticatedUserId: target.id,
    sessionId,
  });
  return {
    actor,
    incidentId: recoveryId(),
    locationId: location.locationId,
    membershipId,
    sessionId,
    shiftId: shift.shiftId,
    target,
  };
}

async function reduce(
  input: Awaited<ReturnType<typeof scenario>>,
  reduction: Reduction,
) {
  const base = `/v1/staff/management/organizations/${input.actor.membership.organizationId}/staff/${input.membershipId}`;
  if (reduction === "ROLE") {
    return fixture.managementPost(
      `${base}/role`,
      input.actor.auth.accessToken,
      {
        expectedVersion: 1,
        role: "LOCATION_MANAGER",
      },
    );
  }
  if (reduction === "DEACTIVATE") {
    return fixture.managementPost(
      `${base}/deactivate`,
      input.actor.auth.accessToken,
      {
        expectedVersion: 1,
      },
    );
  }
  return fixture.managementPost(
    `${base}/location-access/revoke`,
    input.actor.auth.accessToken,
    {
      expectedVersion: 1,
      locationIds: [input.locationId],
    },
  );
}

function reserve(input: Awaited<ReturnType<typeof scenario>>) {
  return createReserveIncidentRecoveryExecutor(runtimePool)({
    authenticatedUserId: input.target.id,
    incidentId: input.incidentId,
    sessionId: input.sessionId,
  });
}

async function endShift(input: Awaited<ReturnType<typeof scenario>>) {
  return createEndShiftCommandExecutor(runtimePool)({
    authenticatedUserId: input.target.id,
    cashReported: "0",
    shiftId: input.shiftId,
  });
}

async function barrierClient(): Promise<Client> {
  const client = new Client({
    connectionString: fixture.migrationDatabaseUrl(),
  });
  await client.connect();
  await client.query("BEGIN");
  return client;
}

async function waitForBlockedTransactions(expected: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const blocked = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_stat_activity
       WHERE datname=current_database() AND pid<>pg_backend_pid()
         AND wait_event_type='Lock'`,
    );
    if (Number(blocked.rows[0]?.count ?? 0) >= expected) return;
  }
  throw new Error(`Timed out waiting for ${expected} blocked transactions.`);
}

async function release(client: Client): Promise<void> {
  try {
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

const reductions: readonly Reduction[] = ["ROLE", "DEACTIVATE", "REVOKE"];
const denialCode: Record<Reduction, string> = {
  DEACTIVATE: "TENANT_ACCESS_DENIED",
  REVOKE: "LOCATION_ACCESS_DENIED",
  ROLE: "AUTHORIZATION_DENIED",
};

describe("MGT-BE-04 IncidentRecoveryIntent vs access reduction", () => {
  for (const reduction of reductions) {
    it(`${reduction}: committed reservation remains a blocker after canonical Shift end`, async () => {
      const current = await scenario();
      const barrier = await barrierClient();
      try {
        await barrier.query(
          `SELECT pg_advisory_xact_lock(
             hashtextextended('staff-management-org:' || $1::text, 0)
           )`,
          [current.actor.membership.organizationId],
        );
        const lifecycle = reduce(current, reduction);
        await waitForBlockedTransactions(1);
        await expect(reserve(current)).resolves.toMatchObject({
          incidentId: current.incidentId,
          outcome: "RESERVED",
          sessionId: current.sessionId,
        });
        await endShift(current);
        await release(barrier);
        const result = await lifecycle;
        expect(result.status).toBe(409);
        expect(result.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
      } catch (error) {
        await barrier.query("ROLLBACK").catch(() => undefined);
        await barrier.end().catch(() => undefined);
        throw error;
      }
      const intent = await fixture.query<{ state: string }>(
        `SELECT state::text FROM incident_recovery_intents
         WHERE organization_id=$1 AND incident_id=$2`,
        [current.actor.membership.organizationId, current.incidentId],
      );
      expect(intent.rows[0]?.state).toBe("RESERVED");
    }, 30_000);

    it(`${reduction}: committed reduction invalidates an already-started reservation`, async () => {
      const current = await scenario();
      const barrier = await barrierClient();
      try {
        await barrier.query(
          `SELECT id FROM valet_sessions WHERE id=$1 FOR UPDATE`,
          [current.sessionId],
        );
        const reservation = expect(reserve(current)).rejects.toMatchObject({
          code: denialCode[reduction],
          name: "CustodyStaffAuthorizationError",
        });
        await waitForBlockedTransactions(1);
        await endShift(current);
        const lifecycle = await reduce(current, reduction);
        expect(lifecycle.status).toBe(201);
        await release(barrier);
        await reservation;
      } catch (error) {
        await barrier.query("ROLLBACK").catch(() => undefined);
        await barrier.end().catch(() => undefined);
        throw error;
      }
      const intent = await fixture.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM incident_recovery_intents
         WHERE organization_id=$1 AND incident_id=$2`,
        [current.actor.membership.organizationId, current.incidentId],
      );
      expect(intent.rows[0]?.count).toBe("0");
    }, 30_000);
  }
});
