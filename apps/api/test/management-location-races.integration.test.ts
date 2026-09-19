import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { createQueueParkingTaskCommandExecutor } from "../src/modules/dispatch/queue-parking-task-command";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";
import {
  createActiveLocationRaceScenario,
  createLocationRaceIntake,
  createStoppedLocationRaceScenario,
  locationRaceBarrierClient,
  releaseLocationRaceBarrier,
  waitForLocationRaceBlocked,
} from "./management-location-race-test-helpers";

const fixture = new ManagementAuditTestFixture();
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

describe("MGT-BE-07 Location lifecycle serialization", () => {
  it("lets intake commit first, then stop-intake fences every later intake", async () => {
    const current = await createActiveLocationRaceScenario(fixture);
    const barrier = await locationRaceBarrierClient(
      fixture.migrationDatabaseUrl(),
    );
    try {
      await barrier.query("LOCK TABLE audit_events IN ACCESS EXCLUSIVE MODE");
      const accepted = createLocationRaceIntake(runtimePool, {
        employeeUserId: current.employee.id,
        locationId: current.locationId,
      });
      await waitForLocationRaceBlocked(fixture, 1);
      const stop = fixture.managementPost(
        `${current.base}/stop-intake`,
        current.admin.auth.accessToken,
        {
          expectedUpdatedAt: current.updatedAt,
        },
      );
      await waitForLocationRaceBlocked(fixture, 2);
      await releaseLocationRaceBarrier(barrier);
      expect((await accepted).state).toBe("CHECKING_IN");
      expect((await stop).status).toBe(201);
      await expect(
        createLocationRaceIntake(runtimePool, {
          employeeUserId: current.employee.id,
          locationId: current.locationId,
        }),
      ).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
  }, 30_000);

  it("lets stop-intake linearize first and rejects the queued intake without a session", async () => {
    const current = await createActiveLocationRaceScenario(fixture);
    const barrier = await locationRaceBarrierClient(
      fixture.migrationDatabaseUrl(),
    );
    try {
      await barrier.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`,
        [current.admin.membership.organizationId],
      );
      const stop = fixture.managementPost(
        `${current.base}/stop-intake`,
        current.admin.auth.accessToken,
        {
          expectedUpdatedAt: current.updatedAt,
        },
      );
      await waitForLocationRaceBlocked(fixture, 1);
      const rejected = createLocationRaceIntake(runtimePool, {
        employeeUserId: current.employee.id,
        locationId: current.locationId,
      });
      await waitForLocationRaceBlocked(fixture, 2);
      await releaseLocationRaceBarrier(barrier);
      expect((await stop).status).toBe(201);
      await expect(rejected).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
      const rows = await fixture.query(
        `SELECT 1 FROM valet_sessions WHERE location_id=$1`,
        [current.locationId],
      );
      expect(rows.rowCount).toBe(0);
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
  }, 30_000);

  it("rechecks an in-flight Shift start before final deactivation", async () => {
    const current = await createStoppedLocationRaceScenario(fixture);
    const barrier = await locationRaceBarrierClient(
      fixture.migrationDatabaseUrl(),
    );
    try {
      await barrier.query(
        `SELECT id FROM organization_memberships WHERE id=$1 FOR UPDATE`,
        [current.employeeMembershipId],
      );
      const shift = createStartShiftCommandExecutor(runtimePool)({
        authenticatedUserId: current.employee.id,
        targetLocationId: current.locationId,
      });
      await waitForLocationRaceBlocked(fixture, 1);
      const deactivate = fixture.managementPost(
        `${current.base}/deactivate`,
        current.admin.auth.accessToken,
        {
          expectedUpdatedAt: current.updatedAt,
        },
      );
      await waitForLocationRaceBlocked(fixture, 2);
      await releaseLocationRaceBarrier(barrier);
      expect((await shift).status).toBe("ACTIVE");
      const blocked = await deactivate;
      expect(blocked.status).toBe(409);
      expect(blocked.body).toMatchObject({ code: "LOCATION_DRAIN_BLOCKED" });
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
  }, 30_000);

  it("commits final deactivation before a queued Shift start, which then fails closed", async () => {
    const current = await createStoppedLocationRaceScenario(fixture);
    const barrier = await locationRaceBarrierClient(
      fixture.migrationDatabaseUrl(),
    );
    try {
      await barrier.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`,
        [current.admin.membership.organizationId],
      );
      const deactivate = fixture.managementPost(
        `${current.base}/deactivate`,
        current.admin.auth.accessToken,
        {
          expectedUpdatedAt: current.updatedAt,
        },
      );
      await waitForLocationRaceBlocked(fixture, 1);
      const shiftOutcome = createStartShiftCommandExecutor(runtimePool)({
        authenticatedUserId: current.employee.id,
        targetLocationId: current.locationId,
      }).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ error, status: "rejected" as const }),
      );
      await waitForLocationRaceBlocked(fixture, 2);
      await releaseLocationRaceBarrier(barrier);
      expect((await deactivate).status).toBe(201);
      await expect(shiftOutcome).resolves.toMatchObject({
        error: { name: "ShiftOperationError" },
        status: "rejected",
      });
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
  }, 30_000);

  it("does not let a Parking Task appear behind the final blocker recheck", async () => {
    const current = await createStoppedLocationRaceScenario(fixture);
    const shift = await createStartShiftCommandExecutor(runtimePool)({
      authenticatedUserId: current.employee.id,
      targetLocationId: current.locationId,
    });
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    await fixture.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
      VALUES($1,$2,'Race task',clock_timestamp())`,
      [vehicleId, current.admin.membership.organizationId],
    );
    await fixture.query(
      `INSERT INTO valet_sessions
      (id,customer_access_token_hash,customer_access_expires_at,organization_id,location_id,
       vehicle_id,state,checked_in_by_membership_id,version,updated_at)
      VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'AWAITING_PARKING',$6,1,clock_timestamp())`,
      [
        sessionId,
        `disabled:${randomUUID()}`,
        current.admin.membership.organizationId,
        current.locationId,
        vehicleId,
        current.employeeMembershipId,
      ],
    );
    const barrier = await locationRaceBarrierClient(
      fixture.migrationDatabaseUrl(),
    );
    try {
      await barrier.query(
        "LOCK TABLE dispatch_events IN ACCESS EXCLUSIVE MODE",
      );
      const task = createQueueParkingTaskCommandExecutor(runtimePool)({
        authenticatedUserId: current.employee.id,
        sessionId,
      });
      await waitForLocationRaceBlocked(fixture, 1);
      const deactivate = fixture.managementPost(
        `${current.base}/deactivate`,
        current.admin.auth.accessToken,
        {
          expectedUpdatedAt: current.updatedAt,
        },
      );
      await waitForLocationRaceBlocked(fixture, 2);
      await releaseLocationRaceBarrier(barrier);
      expect((await task).status).toBe("QUEUED");
      const blocked = await deactivate;
      expect(blocked.status).toBe(409);
      expect(blocked.body).toMatchObject({ code: "LOCATION_DRAIN_BLOCKED" });
      expect(shift.status).toBe("ACTIVE");
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
  }, 30_000);
});
