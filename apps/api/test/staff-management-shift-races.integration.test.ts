import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
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

describe("MGT-BE-04 Shift start vs access reduction", () => {
  for (const reduction of reductions) {
    it(`${reduction}: committed Shift start becomes a handover blocker`, async () => {
      const current = await scenario();
      const barrier = await barrierClient();
      try {
        await holdManagementOrganization(barrier, current.actor.membership.organizationId);
        const lifecycle = reduce(current, reduction);
        await waitForBlockedTransactions(1);
        const shift = await createStartShiftCommandExecutor(runtimePool)({
          authenticatedUserId: current.target.id,
          targetLocationId: current.locationId,
        });
        expect(shift.status).toBe("ACTIVE");
        await release(barrier);
        const result = await lifecycle;
        expect(result.status).toBe(409);
        expect(result.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
      } catch (error) {
        await barrier.query("ROLLBACK").catch(() => undefined);
        await barrier.end().catch(() => undefined);
        throw error;
      }
    }, 30_000);

    it(`${reduction}: committed access reduction makes queued Shift start ineligible`, async () => {
      const current = await scenario();
      const barrier = await barrierClient();
      try {
        await holdAuditWrites(barrier);
        const lifecycle = reduce(current, reduction);
        await waitForBlockedTransactions(1);
        const shift = createStartShiftCommandExecutor(runtimePool)({
          authenticatedUserId: current.target.id,
          targetLocationId: current.locationId,
        });
        await waitForBlockedTransactions(2);
        await release(barrier);
        expect((await lifecycle).status).toBe(201);
        await expect(shift).rejects.toMatchObject({ name: "ShiftOperationError" });
      } catch (error) {
        await barrier.query("ROLLBACK").catch(() => undefined);
        await barrier.end().catch(() => undefined);
        throw error;
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
