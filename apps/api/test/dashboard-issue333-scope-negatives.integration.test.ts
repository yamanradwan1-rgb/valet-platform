import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";

const organizationsPath = "/v1/staff/dashboard/organizations";
const locationsPath = (organizationId: string) =>
  `${organizationsPath}/${organizationId}/locations`;

async function locationManager() {
  const user = await fixture.createUser();
  const { membershipId, organizationId } = await fixture.createMembership(
    user.id,
    { role: "LOCATION_MANAGER" },
  );
  const { locationId } = await fixture.addLocation(organizationId);
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
    [organizationId, membershipId, locationId],
  );
  const auth = await fixture.nativeLogin(user);
  return { auth, locationId, membershipId, organizationId, user };
}

async function adminFor(organizationId: string, assure = true) {
  const user = await fixture.createUser();
  await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
  const auth = await fixture.nativeLogin(user);
  if (assure) await fixture.enrollAndAssure(auth);
  return auth;
}

async function versionOf(membershipId: string) {
  const result = await fixture.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1",
    [membershipId],
  );
  return result.rows[0]!.version;
}

beforeAll(startIssue333Lab, 180_000);
afterAll(stopIssue333Lab, 90_000);

describe("Issue #333 P1-B: fresh authenticated Dashboard scope negatives", () => {
  it("preserves two LM organizations and excludes foreign or ineligible memberships", async () => {
    const primary = await locationManager();
    const second = await fixture.createMembership(primary.user.id, {
      role: "LOCATION_MANAGER",
    });
    const secondLocation = await fixture.addLocation(second.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [second.organizationId, second.membershipId, secondLocation.locationId],
    );
    await fixture.createMembership(primary.user.id, {
      role: "VALET_SUPERVISOR",
    });
    const foreign = await locationManager();
    const response = await fixture.managementGet(
      organizationsPath,
      primary.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const items = response.body?.items as Array<{ organizationId: string }>;
    expect(new Set(items.map((item) => item.organizationId))).toEqual(
      new Set([primary.organizationId, second.organizationId]),
    );
    expect(JSON.stringify(response.body)).not.toContain(foreign.organizationId);
    const secondResponse = await fixture.managementGet(
      locationsPath(second.organizationId),
      primary.auth.accessToken,
    );
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body?.items).toEqual([
      expect.objectContaining({ locationId: secondLocation.locationId }),
    ]);
    const foreignResponse = await fixture.managementGet(
      locationsPath(foreign.organizationId),
      primary.auth.accessToken,
    );
    expect(foreignResponse.status).toBe(404);
    expect(JSON.stringify(foreignResponse.body)).not.toContain(
      foreign.locationId,
    );
  }, 30_000);

  it("fresh scope discovery drops only a revoked grant after genuine Company Admin HTTP", async () => {
    const manager = await locationManager();
    const retained = await fixture.addLocation(manager.organizationId, {
      name: `ISSUE333-RETAINED-${randomUUID()}`,
    });
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [manager.organizationId, manager.membershipId, retained.locationId],
    );
    const admin = await adminFor(manager.organizationId);
    const revoke = await fixture.managementPost(
      `/v1/staff/management/organizations/${manager.organizationId}/staff/` +
        `${manager.membershipId}/location-access/revoke`,
      admin.accessToken,
      {
        expectedVersion: await versionOf(manager.membershipId),
        locationIds: [manager.locationId],
      },
    );
    expect(revoke.status).toBe(201);
    const response = await fixture.managementGet(
      locationsPath(manager.organizationId),
      manager.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.items).toEqual([
      expect.objectContaining({ locationId: retained.locationId }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain(manager.locationId);
  }, 30_000);

  it("password-only Company Admin cannot revoke grant, and no protected scope changes", async () => {
    const manager = await locationManager();
    const passwordOnlyAdmin = await adminFor(manager.organizationId, false);
    const revoked = await fixture.managementPost(
      `/v1/staff/management/organizations/${manager.organizationId}/staff/` +
        `${manager.membershipId}/location-access/revoke`,
      passwordOnlyAdmin.accessToken,
      {
        expectedVersion: await versionOf(manager.membershipId),
        locationIds: [manager.locationId],
      },
    );
    expect(revoked.status).toBe(403);
    const response = await fixture.managementGet(
      locationsPath(manager.organizationId),
      manager.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.items).toEqual([
      expect.objectContaining({ locationId: manager.locationId }),
    ]);
  }, 30_000);
});
