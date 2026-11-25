import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  staffRaceBarrierCloser,
  trackStaffRaceRequest,
  waitForStaffRaceBlockingTree,
} from "./staff-race-lock-observer";

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
  return { actor, locationId: location.locationId, membershipId, target };
}

async function reduce(
  input: Awaited<ReturnType<typeof scenario>>,
  reduction: Reduction,
) {
  const base = `/v1/staff/management/organizations/${input.actor.membership.organizationId}/staff/${input.membershipId}`;
  if (reduction === "ROLE") {
    return fixture.managementPost(`${base}/role`, input.actor.auth.accessToken, {
      expectedVersion: 1,
      role: "LOCATION_MANAGER",
    });
  }
  if (reduction === "DEACTIVATE") {
    return fixture.managementPost(`${base}/deactivate`, input.actor.auth.accessToken, {
      expectedVersion: 1,
    });
  }
  return fixture.managementPost(`${base}/location-access/revoke`, input.actor.auth.accessToken, {
    expectedVersion: 1,
    locationIds: [input.locationId],
  });
}

async function barrierClient(): Promise<Client> {
  const client = new Client({ connectionString: fixture.migrationDatabaseUrl() });
  await client.connect();
  await client.query("BEGIN");
  return client;
}

async function holdManagementOrganization(client: Client, organizationId: string) {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-management-org:' || $1::text, 0)
     )`,
    [organizationId],
  );
}

async function holdAuditWrites(client: Client) {
  await client.query("LOCK TABLE audit_events IN ACCESS EXCLUSIVE MODE");
}

const reductions: readonly Reduction[] = ["ROLE", "DEACTIVATE", "REVOKE"];

describe("MGT-BE-04 Shift start vs access reduction", () => {
  for (const reduction of reductions) {
    it(`${reduction}: committed Shift start becomes a handover blocker`, async () => {
      const current = await scenario();
      const barrier = await barrierClient();
      const closing = staffRaceBarrierCloser(barrier);
      const pending: Promise<unknown>[] = [];
      try {
        await holdManagementOrganization(barrier, current.actor.membership.organizationId);
        const lifecycle = trackStaffRaceRequest(pending, reduce(current, reduction));
        await waitForStaffRaceBlockingTree(fixture.databasePool(), barrier, 1);
        const shift = await createStartShiftCommandExecutor(runtimePool)({
          authenticatedUserId: current.target.id,
          targetLocationId: current.locationId,
        });
        expect(shift.status).toBe("ACTIVE");
        await closing.close("COMMIT");
        const result = await lifecycle;
        expect(result.status).toBe(409);
        expect(result.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
      } finally {
        await closing.close("ROLLBACK").catch(() => undefined);
        await Promise.allSettled(pending);
      }
    }, 30_000);

    it(`${reduction}: committed access reduction makes queued Shift start ineligible`, async () => {
      const current = await scenario();
      const barrier = await barrierClient();
      const closing = staffRaceBarrierCloser(barrier);
      const pending: Promise<unknown>[] = [];
      try {
        await holdAuditWrites(barrier);
        const lifecycle = trackStaffRaceRequest(pending, reduce(current, reduction));
        await waitForStaffRaceBlockingTree(fixture.databasePool(), barrier, 1);
        const shiftOutcome = trackStaffRaceRequest(pending, createStartShiftCommandExecutor(runtimePool)({
          authenticatedUserId: current.target.id,
          targetLocationId: current.locationId,
        }).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (error: unknown) => ({ error, status: "rejected" as const }),
        ));
        await waitForStaffRaceBlockingTree(fixture.databasePool(), barrier, 2);
        await closing.close("COMMIT");
        expect((await lifecycle).status).toBe(201);
        await expect(shiftOutcome).resolves.toMatchObject({
          error: { name: "ShiftOperationError" },
          status: "rejected",
        });
      } finally {
        await closing.close("ROLLBACK").catch(() => undefined);
        await Promise.allSettled(pending);
      }
      const active = await fixture.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM shifts
         WHERE membership_id=$1 AND status='ACTIVE'`,
        [current.membershipId],
      );
      expect(active.rows[0]?.count).toBe("0");
    }, 30_000);
  }
});
