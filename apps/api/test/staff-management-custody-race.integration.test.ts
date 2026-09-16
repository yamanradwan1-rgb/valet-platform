import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createQueueParkingTaskCommandExecutor } from "../src/modules/dispatch/queue-parking-task-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import { createStartParkingCommandExecutor } from "../src/modules/parking/start-parking-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
let runtimePool: PostgresPool;

beforeAll(async () => {
  await fixture.start();
  runtimePool = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(async () => {
  await runtimePool?.end();
  await fixture.stop();
}, 60_000);

async function scenario() {
  const adminUser = await fixture.createUser();
  const adminMembership = await fixture.createMembership(adminUser.id);
  const adminAuth = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(adminAuth);
  const target = await fixture.createUser();
  const handoff = await fixture.createUser();
  const targetMembershipId = await fixture.addMembership(
    adminMembership.organizationId,
    target.id,
    "VALET_SUPERVISOR",
  );
  const handoffMembershipId = await fixture.addMembership(
    adminMembership.organizationId,
    handoff.id,
    "VALET_EMPLOYEE",
  );
  const location = await fixture.addLocation(adminMembership.organizationId);
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3),($1,$4,$3)`,
    [
      adminMembership.organizationId,
      targetMembershipId,
      location.locationId,
      handoffMembershipId,
    ],
  );
  const targetShift = await createStartShiftCommandExecutor(runtimePool)({
    authenticatedUserId: target.id,
    targetLocationId: location.locationId,
  });
  await createStartShiftCommandExecutor(runtimePool)({
    authenticatedUserId: handoff.id,
    targetLocationId: location.locationId,
  });
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  const keySlotId = randomUUID();
  const keySlotCode = `C-${randomUUID()}`;
  await fixture.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,transaction_timestamp())`,
    [vehicleId, adminMembership.organizationId, `Custody race ${vehicleId}`],
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
      `disabled:custody-race:${randomUUID()}`,
      adminMembership.organizationId,
      location.locationId,
      vehicleId,
      targetMembershipId,
    ],
  );
  await fixture.query(
    `INSERT INTO key_slots(id,organization_id,location_id,code,status,updated_at)
     VALUES($1,$2,$3,$4,'ACTIVE',transaction_timestamp())`,
    [keySlotId, adminMembership.organizationId, location.locationId, keySlotCode],
  );
  await createAssignKeySlotCommandExecutor(runtimePool)({
    authenticatedUserId: target.id,
    expectedVersion: 1,
    keySlotCode,
    sessionId,
  });
  const queued = await createQueueParkingTaskCommandExecutor(runtimePool)({
    authenticatedUserId: target.id,
    sessionId,
  });
  const assigned = await createAssignTaskCommandExecutor(runtimePool)({
    authenticatedUserId: target.id,
    expectedVersion: queued.version,
    taskId: queued.taskId,
  });
  const accepted = await createAcceptTaskCommandExecutor(runtimePool)({
    authenticatedUserId: target.id,
    expectedVersion: assigned.version,
    taskId: queued.taskId,
  });
  return {
    adminAuth,
    adminMembership,
    accepted,
    handoff,
    handoffMembershipId,
    locationId: location.locationId,
    queued,
    sessionId,
    target,
    targetMembershipId,
    targetShiftId: targetShift.shiftId,
  };
}

function revokePath(value: Awaited<ReturnType<typeof scenario>>) {
  return `/v1/staff/management/organizations/${value.adminMembership.organizationId}/staff/${value.targetMembershipId}/location-access/revoke`;
}

function revoke(value: Awaited<ReturnType<typeof scenario>>) {
  return fixture.managementPost(revokePath(value), value.adminAuth.accessToken, {
    expectedVersion: 1,
    locationIds: [value.locationId],
  });
}

async function barrierClient(): Promise<Client> {
  const client = new Client({ connectionString: fixture.migrationDatabaseUrl() });
  await client.connect();
  await client.query("BEGIN");
  return client;
}

async function waitForLockWait(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const blocked = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_stat_activity
       WHERE datname=current_database() AND pid<>pg_backend_pid()
         AND wait_event_type='Lock'`,
    );
    if (Number(blocked.rows[0]?.count ?? 0) >= 1) return;
  }
  throw new Error("Timed out waiting for PostgreSQL lock wait.");
}

async function release(client: Client): Promise<void> {
  try {
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

describe("MGT-BE-04 physical key checkout vs Location access reduction", () => {
  it("keeps committed checkout/task responsibility authoritative and blocks revoke", async () => {
    const value = await scenario();
    const barrier = await barrierClient();
    try {
      await barrier.query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended('staff-management-org:' || $1::text, 0)
         )`,
        [value.adminMembership.organizationId],
      );
      const lifecycle = revoke(value);
      await waitForLockWait();
      const parking = await createStartParkingCommandExecutor(runtimePool)({
        authenticatedUserId: value.target.id,
        expectedSessionVersion: 2,
        expectedTaskVersion: value.accepted.version,
        sessionId: value.sessionId,
      });
      expect(parking.taskStatus).toBe("IN_PROGRESS");
      await release(barrier);
      const result = await lifecycle;
      expect(result.status).toBe(409);
      expect(result.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
    const custody = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM key_custody_events
       WHERE valet_session_id=$1 AND event_type='CHECKED_OUT'`,
      [value.sessionId],
    );
    expect(custody.rows[0]?.count).toBe("1");
  }, 30_000);

  it("prevents stale checkout after truthful Task handover and committed revoke", async () => {
    const value = await scenario();
    const reassigned = await createReassignTaskCommandExecutor(runtimePool)({
      authenticatedUserId: value.target.id,
      expectedVersion: value.accepted.version,
      reason: "BE-04 custody handover",
      targetAssigneeMembershipId: value.handoffMembershipId,
      taskId: value.queued.taskId,
    });
    expect(reassigned.currentAssigneeMembershipId).toBe(value.handoffMembershipId);
    await createEndShiftCommandExecutor(runtimePool)({
      authenticatedUserId: value.target.id,
      cashReported: "0",
      shiftId: value.targetShiftId,
    });
    const lifecycle = await revoke(value);
    expect(lifecycle.status).toBe(201);
    await expect(
      createStartParkingCommandExecutor(runtimePool)({
        authenticatedUserId: value.target.id,
        expectedSessionVersion: 2,
        expectedTaskVersion: value.accepted.version,
        sessionId: value.sessionId,
      }),
    ).rejects.toMatchObject({ name: "StartParkingError" });
    const custody = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM key_custody_events
       WHERE valet_session_id=$1 AND event_type='CHECKED_OUT'`,
      [value.sessionId],
    );
    expect(custody.rows[0]?.count).toBe("0");
    const history = await fixture.query<{
      cleanup_events: string;
      reassign_events: string;
      staff_events: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM dispatch_events
          WHERE task_id=$1 AND event_type='REASSIGNED') AS reassign_events,
         (SELECT count(*)::text FROM audit_events
          WHERE entity_id=$2 AND event_type='STAFF_LOCATION_ACCESS_REVOKED') AS staff_events,
         (SELECT count(*)::text FROM key_custody_events
          WHERE valet_session_id=$3
            AND event_type IN ('RETURNED_TO_SLOT','RELEASED','SLOT_CLEARED')) AS cleanup_events`,
      [value.queued.taskId, value.targetMembershipId, value.sessionId],
    );
    expect(history.rows[0]).toEqual({
      cleanup_events: "0",
      reassign_events: "1",
      staff_events: "1",
    });
  }, 30_000);
});
