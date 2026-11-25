import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  staffRaceBarrierCloser,
  trackStaffRaceRequest,
  waitForStaffRaceBlockingTree,
} from "./staff-race-lock-observer";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function grant(
  organizationId: string,
  membershipId: string,
  locationId: string,
) {
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [organizationId, membershipId, locationId],
  );
}

async function scenario(targetGrants: "A" | "AB" = "AB") {
  const adminUser = await fixture.createUser();
  const admin = await fixture.createMembership(adminUser.id);
  const adminAuth = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(adminAuth);

  const managerUser = await fixture.createUser();
  const managerId = await fixture.addMembership(
    admin.organizationId,
    managerUser.id,
    "LOCATION_MANAGER",
  );
  const locationA = await fixture.addLocation(admin.organizationId, {
    name: "A",
  });
  const locationB = await fixture.addLocation(admin.organizationId, {
    name: "B",
  });
  const locationC = await fixture.addLocation(admin.organizationId, {
    name: "C",
  });
  await grant(admin.organizationId, managerId, locationA.locationId);
  await grant(admin.organizationId, managerId, locationB.locationId);
  const managerAuth = await fixture.nativeLogin(managerUser);
  await fixture.enrollAndAssure(managerAuth);

  const targetUser = await fixture.createUser();
  const targetId = await fixture.addMembership(
    admin.organizationId,
    targetUser.id,
    "VALET_EMPLOYEE",
  );
  await grant(admin.organizationId, targetId, locationA.locationId);
  if (targetGrants === "AB")
    await grant(admin.organizationId, targetId, locationB.locationId);
  return {
    admin,
    adminAuth,
    locationA,
    locationB,
    locationC,
    managerAuth,
    managerId,
    organizationId: admin.organizationId,
    targetId,
  };
}

function targetBase(input: Awaited<ReturnType<typeof scenario>>) {
  return `/v1/staff/management/organizations/${input.organizationId}/staff/${input.targetId}`;
}

function managerBase(input: Awaited<ReturnType<typeof scenario>>) {
  return `/v1/staff/management/organizations/${input.organizationId}/staff/${input.managerId}`;
}

async function barrier(organizationId: string): Promise<Client> {
  const client = new Client({
    connectionString: fixture.migrationDatabaseUrl(),
  });
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-management-org:' || $1::text, 0)
     )`,
    [organizationId],
  );
  return client;
}

describe("T05-B LM staff authority serialization races", () => {
  it("actor grant revoke commits first, so a waiting LM command rechecks and fails", async () => {
    const current = await scenario("AB");
    const lock = await barrier(current.organizationId);
    const closing = staffRaceBarrierCloser(lock);
    const pending: Promise<unknown>[] = [];
    try {
      const revoke = trackStaffRaceRequest(pending, fixture.managementPost(
        `${managerBase(current)}/location-access/revoke`,
        current.adminAuth.accessToken,
        { expectedVersion: 1, locationIds: [current.locationB.locationId] },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 1);
      const command = trackStaffRaceRequest(pending, fixture.managementPost(
        `${targetBase(current)}/role`,
        current.managerAuth.accessToken,
        { expectedVersion: 1, role: "VALET_SUPERVISOR" },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 2);
      await closing.close("COMMIT");
      expect((await revoke).status).toBe(201);
      const denied = await command;
      expect(denied.status).toBe(404);
      expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    } finally {
      await closing.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(pending);
    }
  }, 30_000);

  it("target becomes mixed first, so a waiting LM command cannot use stale preflight", async () => {
    const current = await scenario("A");
    const lock = await barrier(current.organizationId);
    const closing = staffRaceBarrierCloser(lock);
    const pending: Promise<unknown>[] = [];
    try {
      const mix = trackStaffRaceRequest(pending, fixture.managementPost(
        `${targetBase(current)}/location-access/grant`,
        current.adminAuth.accessToken,
        { expectedVersion: 1, locationIds: [current.locationC.locationId] },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 1);
      const command = trackStaffRaceRequest(pending, fixture.managementPost(
        `${targetBase(current)}/role`,
        current.managerAuth.accessToken,
        { expectedVersion: 1, role: "VALET_SUPERVISOR" },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 2);
      await closing.close("COMMIT");
      expect((await mix).status).toBe(201);
      const denied = await command;
      expect(denied.status).toBe(404);
      expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    } finally {
      await closing.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(pending);
    }
  }, 30_000);

  it("target reaches zero grants first, so a waiting LM status command stays concealed", async () => {
    const current = await scenario("A");
    const lock = await barrier(current.organizationId);
    const closing = staffRaceBarrierCloser(lock);
    const pending: Promise<unknown>[] = [];
    try {
      const zero = trackStaffRaceRequest(pending, fixture.managementPost(
        `${targetBase(current)}/location-access/revoke`,
        current.adminAuth.accessToken,
        { expectedVersion: 1, locationIds: [current.locationA.locationId] },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 1);
      const command = trackStaffRaceRequest(pending, fixture.managementPost(
        `${targetBase(current)}/deactivate`,
        current.managerAuth.accessToken,
        { expectedVersion: 1 },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 2);
      await closing.close("COMMIT");
      expect((await zero).status).toBe(201);
      const denied = await command;
      expect(denied.status).toBe(404);
      expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    } finally {
      await closing.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(pending);
    }
  }, 30_000);

  it("serializes two conflicting expectedVersion LM commands to one change and one CAS conflict", async () => {
    const current = await scenario("A");
    const [role, status] = await Promise.all([
      fixture.managementPost(
        `${targetBase(current)}/role`,
        current.managerAuth.accessToken,
        { expectedVersion: 1, role: "VALET_SUPERVISOR" },
      ),
      fixture.managementPost(
        `${targetBase(current)}/deactivate`,
        current.managerAuth.accessToken,
        { expectedVersion: 1 },
      ),
    ]);
    expect([role.status, status.status].sort()).toEqual([201, 409]);
    const conflict = role.status === 409 ? role : status;
    expect(conflict.body).toMatchObject({ code: "VERSION_CONFLICT" });
    const membership = await fixture.query<{ version: number }>(
      `SELECT version FROM organization_memberships WHERE id=$1`,
      [current.targetId],
    );
    expect(membership.rows[0]?.version).toBe(2);
  }, 30_000);

  it("Location deactivation commits first, so a waiting LM command rechecks active-grant coverage", async () => {
    const current = await scenario("A");
    const locationPath = `/v1/staff/management/organizations/${current.organizationId}/locations/${current.locationA.locationId}`;
    const before = await fixture.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id=$1`,
      [current.locationA.locationId],
    );
    const stopped = await fixture.managementPost(
      `${locationPath}/stop-intake`,
      current.adminAuth.accessToken,
      { expectedUpdatedAt: before.rows[0]!.updated_at.toISOString() },
    );
    expect(stopped.status).toBe(201);
    const stoppedAt = String(
      (stopped.body as { location?: { updatedAt?: string } }).location
        ?.updatedAt ?? (stopped.body as { updatedAt?: string }).updatedAt,
    );
    const lock = await barrier(current.organizationId);
    const closing = staffRaceBarrierCloser(lock);
    const pending: Promise<unknown>[] = [];
    try {
      const deactivate = trackStaffRaceRequest(pending, fixture.managementPost(
        `${locationPath}/deactivate`,
        current.adminAuth.accessToken,
        { expectedUpdatedAt: stoppedAt },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 1);
      const command = trackStaffRaceRequest(pending, fixture.managementPost(
        `${targetBase(current)}/role`,
        current.managerAuth.accessToken,
        { expectedVersion: 1, role: "VALET_SUPERVISOR" },
      ));
      await waitForStaffRaceBlockingTree(fixture.databasePool(), lock, 2);
      await closing.close("COMMIT");
      expect((await deactivate).status).toBe(201);
      const denied = await command;
      expect(denied.status).toBe(404);
      expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    } finally {
      await closing.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(pending);
    }
  }, 30_000);
});
