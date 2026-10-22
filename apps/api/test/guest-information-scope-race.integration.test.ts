import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
let adminPool: Pool;

beforeAll(async () => {
  await fixture.start();
  const runtime = new URL(fixture.runtimeDatabaseUrl());
  const admin = new URL(process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
    "postgresql://valet:valet@127.0.0.1:5432/valet");
  admin.pathname = runtime.pathname;
  adminPool = new Pool({ connectionString: admin.toString(), max: 2 });
}, 120_000);
afterAll(async () => {
  if (adminPool) await adminPool.end();
  await fixture.stop();
}, 60_000);

async function managerContext() {
  const companyUser = await fixture.createUser();
  const owner = await fixture.createMembership(companyUser.id);
  const location = await fixture.addLocation(owner.organizationId);
  const managerUser = await fixture.createUser();
  const managerId = await fixture.addMembership(owner.organizationId,
    managerUser.id, "LOCATION_MANAGER");
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`, [owner.organizationId, managerId, location.locationId]);
  const auth = await fixture.nativeLogin(managerUser);
  await fixture.enrollAndAssure(auth);
  return {
    auth, managerId, organizationId: owner.organizationId,
    locationId: location.locationId,
    path: `/v1/staff/management/organizations/${owner.organizationId}/locations/` +
      `${location.locationId}/guest-information/privacy`,
  };
}

const draft = {
  expectedRevision: 0,
  drafts: { en: { text: "Access must still be current", url: "" },
    ar: { text: "", url: "" } },
};

describe("#316 grant and lifecycle revocation races", () => {
  it("denies a waiting manager write after its exact Location grant is revoked", async () => {
    const scope = await managerContext();
    const revoker = await adminPool.connect();
    let open = false;
    try {
      await revoker.query("BEGIN");
      open = true;
      await revoker.query(
        `DELETE FROM membership_location_access
         WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
        [scope.organizationId, scope.managerId, scope.locationId]);
      let resolved = false;
      const waiting = fixture.managementPut(scope.path, scope.auth.accessToken, draft)
        .then((response) => { resolved = true; return response; });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(resolved).toBe(false);
      await revoker.query("COMMIT");
      open = false;
      const denied = await waiting;
      expect(denied.status).toBe(404);
      expect(denied.body?.code).toBe("AUTHORIZATION_DENIED");
    } finally {
      if (open) await revoker.query("ROLLBACK");
      revoker.release();
    }
    const saved = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM guest_location_privacy
       WHERE organization_id=$1 AND location_id=$2`,
      [scope.organizationId, scope.locationId]);
    expect(saved.rows[0]?.count).toBe("0");
  }, 30_000);

  it("denies a manager write after concurrent Location deactivation wins", async () => {
    const scope = await managerContext();
    const revoker = await adminPool.connect();
    let open = false;
    try {
      await revoker.query("BEGIN");
      open = true;
      await revoker.query(
        `UPDATE locations SET status='INACTIVE'
         WHERE organization_id=$1 AND id=$2`,
        [scope.organizationId, scope.locationId]);
      let resolved = false;
      const waiting = fixture.managementPut(scope.path, scope.auth.accessToken, draft)
        .then((response) => { resolved = true; return response; });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(resolved).toBe(false);
      await revoker.query("COMMIT");
      open = false;
      const denied = await waiting;
      expect(denied.status).toBe(404);
      expect(denied.body?.code).toBe("AUTHORIZATION_DENIED");
    } finally {
      if (open) await revoker.query("ROLLBACK");
      revoker.release();
    }
  }, 30_000);
});
