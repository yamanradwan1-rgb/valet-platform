import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import { DashboardScopeDiscoveryService } from "../src/modules/dashboard/dashboard-scope-discovery.service";
import {
  barrier,
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          8_000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

beforeAll(startIssue333Lab, 180_000);
afterAll(stopIssue333Lab, 90_000);
afterEach(() => vi.restoreAllMocks());

it("P1-B retains an authorized Location when the canonical revoker rolls back on stale CAS", async () => {
  const managerUser = await fixture.createUser();
  const { membershipId, organizationId } = await fixture.createMembership(
    managerUser.id,
    { role: "LOCATION_MANAGER" },
  );
  const { locationId } = await fixture.addLocation(organizationId);
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES ($1,$2,$3)`,
    [organizationId, membershipId, locationId],
  );
  const manager = await fixture.nativeLogin(managerUser);
  const adminUser = await fixture.createUser();
  await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);

  const entered = barrier();
  const resume = barrier();
  const original = DashboardScopeDiscoveryService.prototype.listLocations;
  vi.spyOn(
    DashboardScopeDiscoveryService.prototype,
    "listLocations",
  ).mockImplementation(async function (
    this: DashboardScopeDiscoveryService,
    ...args
  ) {
    const projection = await original.apply(this, args);
    if (projection.items.some((item) => item.locationId === locationId)) {
      entered.release();
      await resume.promise;
    }
    return projection;
  });

  const path = `/v1/staff/dashboard/organizations/${organizationId}/locations`;
  const pendingReader = fixture.managementGet(path, manager.accessToken);
  let pendingResult: Awaited<typeof pendingReader> | undefined;
  try {
    await bounded(entered.promise, "P1-B rollback reader projection");
    const versionResult = await fixture.query<{ version: number }>(
      "SELECT version FROM organization_memberships WHERE id=$1",
      [membershipId],
    );
    const conflict = await bounded(
      fixture.managementPost(
        `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}/location-access/revoke`,
        admin.accessToken,
        {
          expectedVersion: versionResult.rows[0]!.version + 1,
          locationIds: [locationId],
        },
      ),
      "P1-B canonical stale-CAS writer",
    );
    expect(conflict.status).toBe(409);
    const persisted = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [organizationId, membershipId, locationId],
    );
    expect(persisted.rows[0]?.count).toBe("1");
    console.log(
      "ISSUE333_P1B_ROLLBACK",
      JSON.stringify({
        writerStatus: conflict.status,
        grantCountAfterRollback: persisted.rows[0]?.count,
        gate: "POST_REAL_SQL_TRANSACTION_PRE_HTTP_DELIVERY",
      }),
    );
  } finally {
    resume.release();
    pendingResult = await bounded(pendingReader, "P1-B rollback reader drain");
  }

  expect(pendingResult.status).toBe(200);
  expect(JSON.stringify(pendingResult.body)).toContain(locationId);
  const fresh = await fixture.managementGet(path, manager.accessToken);
  expect(fresh.status).toBe(200);
  expect(JSON.stringify(fresh.body)).toContain(locationId);
}, 40_000);
