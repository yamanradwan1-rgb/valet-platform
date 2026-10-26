import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";
import {
  createStoppedLocationRaceScenario,
  createLocationRaceIntake,
  locationRaceBarrierClient,
  waitForLocationRaceBlocked,
} from "./management-location-race-test-helpers";

const fixture = new ManagementAuditTestFixture();
let runtime: PostgresPool;
beforeAll(async () => {
  await fixture.start();
  runtime = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(async () => {
  await runtime?.end();
  await fixture.stop();
}, 60_000);

it("Resume linearizes before a queued intake, which rechecks persisted state and succeeds", async () => {
  const s = await createStoppedLocationRaceScenario(fixture);
  const barrier = await locationRaceBarrierClient(
    fixture.migrationDatabaseUrl(),
  );
  try {
    await barrier.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))",
      [s.admin.membership.organizationId],
    );
    const resume = fixture.managementPost(
      `${s.base}/resume-intake`,
      s.admin.auth.accessToken,
      { expectedUpdatedAt: s.updatedAt },
    );
    await waitForLocationRaceBlocked(fixture, 1);
    const intake = createLocationRaceIntake(runtime, {
      employeeUserId: s.employee.id,
      locationId: s.locationId,
    });
    await waitForLocationRaceBlocked(fixture, 2);
    await barrier.query("COMMIT");
    expect((await resume).status).toBe(201);
    expect((await intake).state).toBe("CHECKING_IN");
    const rows = await fixture.query(
      "SELECT 1 FROM valet_sessions WHERE location_id=$1",
      [s.locationId],
    );
    expect(rows.rowCount).toBe(1);
  } finally {
    await barrier.query("ROLLBACK");
    await barrier.end();
  }
}, 30_000);

it.each([false, true])(
  "intake holds lifecycle authority before Resume; membership revoked=%s",
  async (revoke) => {
    const s = await createStoppedLocationRaceScenario(fixture);
    const barrier = await locationRaceBarrierClient(
      fixture.migrationDatabaseUrl(),
    );
    try {
      await barrier.query(
        "SELECT id FROM organization_memberships WHERE id=$1 FOR UPDATE",
        [s.employeeMembershipId],
      );
      // Attach a rejection handler immediately while the blocked command is pending.
      const intake = createLocationRaceIntake(runtime, {
        employeeUserId: s.employee.id,
        locationId: s.locationId,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForLocationRaceBlocked(fixture, 1);
      const resume = fixture.managementPost(
        `${s.base}/resume-intake`,
        s.admin.auth.accessToken,
        { expectedUpdatedAt: s.updatedAt },
      );
      await waitForLocationRaceBlocked(fixture, 2);
      if (revoke)
        await barrier.query(
          "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
          [s.employeeMembershipId],
        );
      await barrier.query("COMMIT");
      expect(await intake).toMatchObject({
        code: revoke ? "TENANT_ACCESS_DENIED" : "LOCATION_INTAKE_STOPPED",
      });
      expect((await resume).status).toBe(201);
      const rows = await fixture.query(
        "SELECT 1 FROM valet_sessions WHERE location_id=$1",
        [s.locationId],
      );
      expect(rows.rowCount).toBe(0);
    } finally {
      await barrier.query("ROLLBACK");
      await barrier.end();
    }
  },
  30_000,
);
