import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { raceWithCanonicalRevoke } from "./issue333-w4-visit-contact-race";
import { startIssue333W4PrivateLab } from "./issue333-w4-private-lab";
import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

const fixture = new ManagementVisitContactTestFixture();
let fixtureAttempted = false;
let fixtureReady = false;

interface Scenario {
  readonly adminToken: string;
  readonly grantedA: string;
  readonly grantedB: string;
  readonly lmMembershipId: string;
  readonly lmToken: string;
  readonly organizationId: string;
}

function searchPath(organizationId: string, name = "W4") {
  return `/v1/staff/management/organizations/${organizationId}/visit-contacts?name=${name}`;
}

function historyPath(
  organizationId: string,
  kind: "customer" | "vehicle",
  id: string,
) {
  const segment =
    kind === "customer" ? `visit-contacts/${id}` : `visit-vehicles/${id}`;
  return `/v1/staff/management/organizations/${organizationId}/${segment}/visits`;
}

async function startOwnedLab() {
  await startIssue333W4PrivateLab(fixture, () => {
    fixtureAttempted = true;
  });
  fixtureReady = true;
}

beforeAll(startOwnedLab, 180_000);
afterEach(async () => {
  vi.restoreAllMocks();
  if (fixtureReady) await fixture.resetLimits();
});
afterAll(async () => {
  if (fixtureAttempted) await fixture.stop();
}, 90_000);

async function scenario(): Promise<Scenario> {
  const organizationId = await fixture.createOrganization();
  const lmUser = await fixture.createUser();
  const lmMembershipId = await fixture.addMembership(
    organizationId,
    lmUser.id,
    "LOCATION_MANAGER",
  );
  const grantedA = (await fixture.addLocation(organizationId)).locationId;
  const grantedB = (await fixture.addLocation(organizationId)).locationId;
  const adminUser = await fixture.createUser();
  await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
  const adminAuth = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(adminAuth);
  const granted = await fixture.managementPost(
    `/v1/staff/management/organizations/${organizationId}/staff/${lmMembershipId}/location-access/grant`,
    adminAuth.accessToken,
    { expectedVersion: 1, locationIds: [grantedA, grantedB] },
  );
  expect(granted.status).toBe(201);
  expect(granted.body).toMatchObject({ locationAccessCount: 2 });
  const lmAuth = await fixture.nativeLogin(lmUser);
  return {
    adminToken: adminAuth.accessToken,
    grantedA,
    grantedB,
    lmMembershipId,
    lmToken: lmAuth.accessToken,
    organizationId,
  };
}

async function seed(
  s: Scenario,
  locationId: string,
  marker: string,
  phone: string,
) {
  const customerId = await fixture.createCustomer(
    s.organizationId,
    phone,
    marker,
  );
  const vehicleId = await fixture.createVehicle(s.organizationId, {
    plateNumber: `W4-${phone.slice(-4)}`,
  });
  const sessionId = await fixture.createVisit({
    customerId,
    locationId,
    membershipId: s.lmMembershipId,
    organizationId: s.organizationId,
    vehicleId,
  });
  return { customerId, sessionId, vehicleId };
}

describe("Issue #333 W4 — Visit Contact real HTTP / PostgreSQL authorization", () => {
  it("scopes aggregate LM grants, hides foreign Location/tenant, and keeps granted inactive history", async () => {
    const s = await scenario();
    const a = await seed(
      s,
      s.grantedA,
      "W4_GRANTED_A_PRIVATE",
      "+962790331001",
    );
    const b = await seed(
      s,
      s.grantedB,
      "W4_GRANTED_B_PRIVATE",
      "+962790331002",
    );
    const hidden = (await fixture.addLocation(s.organizationId)).locationId;
    await seed(s, hidden, "W4_HIDDEN_PRIVATE", "+962790331003");
    const inactive = (
      await fixture.addLocation(s.organizationId, { status: "INACTIVE" })
    ).locationId;
    await fixture.grantLocationAccess(
      s.organizationId,
      s.lmMembershipId,
      inactive,
    );
    await seed(s, inactive, "W4_INACTIVE_HISTORY", "+962790331004");
    const foreignOrg = await fixture.createOrganization();
    const foreignLocation = (await fixture.addLocation(foreignOrg)).locationId;
    const foreignUser = await fixture.createUser();
    const foreignMembership = await fixture.addMembership(
      foreignOrg,
      foreignUser.id,
      "VALET_EMPLOYEE",
    );
    const foreignCustomer = await fixture.createCustomer(
      foreignOrg,
      "+962790331005",
      "W4_FOREIGN_PRIVATE",
    );
    const foreignVehicle = await fixture.createVehicle(foreignOrg, {
      plateNumber: "W4-FOREIGN",
    });
    await fixture.createVisit({
      customerId: foreignCustomer,
      locationId: foreignLocation,
      membershipId: foreignMembership,
      organizationId: foreignOrg,
      vehicleId: foreignVehicle,
    });
    const response = await fixture.managementGet(
      searchPath(s.organizationId),
      s.lmToken,
    );
    expect(response.status).toBe(200);
    const body = JSON.stringify(response.body);
    for (const visible of [a.customerId, b.customerId, "W4_INACTIVE_HISTORY"]) {
      expect(body).toContain(visible);
    }
    for (const denied of [
      "W4_HIDDEN_PRIVATE",
      "W4_FOREIGN_PRIVATE",
      hidden,
      foreignVehicle,
    ]) {
      expect(body).not.toContain(denied);
    }
    expect(body).not.toContain("+962790331001");
    const wrongTenant = await fixture.managementGet(
      searchPath(foreignOrg),
      s.lmToken,
    );
    expect(wrongTenant.status).toBe(404);
    expect(JSON.stringify(wrongTenant.body)).not.toContain(
      "W4_FOREIGN_PRIVATE",
    );
  });

  it("denies after the canonical Company Admin role downgrade", async () => {
    const s = await scenario();
    await seed(s, s.grantedA, "W4_ROLE_PRIVATE", "+962790331006");
    const allowed = await fixture.managementGet(
      searchPath(s.organizationId),
      s.lmToken,
    );
    expect(JSON.stringify(allowed.body)).toContain("W4_ROLE_PRIVATE");
    const membership = await fixture.query<{ version: number }>(
      "SELECT version FROM organization_memberships WHERE id=$1",
      [s.lmMembershipId],
    );
    const changed = await fixture.managementPost(
      `/v1/staff/management/organizations/${s.organizationId}/staff/${s.lmMembershipId}/role`,
      s.adminToken,
      { expectedVersion: membership.rows[0]!.version, role: "VALET_EMPLOYEE" },
    );
    expect(changed.status).toBe(201);
    const denied = await fixture.managementGet(
      searchPath(s.organizationId),
      s.lmToken,
    );
    expect(denied.status).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain("W4_ROLE_PRIVATE");
  });

  it("rejects a revoked Location's private contact search projection in flight", async () => {
    const s = await scenario();
    await seed(s, s.grantedA, "W4_REVOKED_SEARCH_PRIVATE", "+962790331007");
    await seed(s, s.grantedB, "W4_STILL_GRANTED_PRIVATE", "+962790331008");
    await raceWithCanonicalRevoke(
      fixture,
      s,
      searchPath(s.organizationId),
      "W4_REVOKED_SEARCH_PRIVATE",
    );
  });

  it("rejects revoked customer history data after canonical grant commit", async () => {
    const s = await scenario();
    const entry = await seed(
      s,
      s.grantedA,
      "W4_REVOKED_CUSTOMER_PRIVATE",
      "+962790331009",
    );
    await raceWithCanonicalRevoke(
      fixture,
      s,
      historyPath(s.organizationId, "customer", entry.customerId),
      "W4_REVOKED_CUSTOMER_PRIVATE",
    );
  });

  it("rejects revoked vehicle history data after canonical grant commit", async () => {
    const s = await scenario();
    const entry = await seed(
      s,
      s.grantedA,
      "W4_REVOKED_VEHICLE_PRIVATE",
      "+962790331010",
    );
    await raceWithCanonicalRevoke(
      fixture,
      s,
      historyPath(s.organizationId, "vehicle", entry.vehicleId),
      "W4_REVOKED_VEHICLE_PRIVATE",
    );
  });
});
