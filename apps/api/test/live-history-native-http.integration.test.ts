import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import { authorizeLiveHistoryLocation } from "../src/modules/dashboard/live-history-read-authorization";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { isolatedLiveHistoryLabConfigured } from "./live-history-owned-lab";

const expectedDirectory =
  "D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data";
const fixture = new ManagementControlPlaneTestFixture();

async function proveIsolatedParent(): Promise<void> {
  const parentUrl = process.env.TEST_DATABASE_URL;
  if (!parentUrl || process.env.MIGRATION_DATABASE_URL !== parentUrl) {
    throw new Error("#276 native HTTP suite refuses any database except owned 55449.");
  }
  const target = new URL(parentUrl);
  if (target.protocol !== "postgresql:" ||
      target.hostname !== "127.0.0.1" || target.port !== "55449" ||
      target.username !== "valet276test" || target.pathname !== "/postgres") {
    throw new Error("#276 native HTTP suite refuses an unexpected PostgreSQL target.");
  }
  const pool = new Pool({ connectionString: parentUrl });
  try {
    const result = await pool.query(
      "SELECT current_database() AS db, current_user AS usr, " +
      "host(inet_server_addr()) AS host, inet_server_port() AS port, " +
      "current_setting('data_directory') AS data",
    );
    const identity = result.rows[0];
    if (identity.db !== "postgres" || identity.usr !== "valet276test" ||
        identity.host !== "127.0.0.1" || identity.port !== 55449 ||
        identity.data !== expectedDirectory) {
      throw new Error("Unexpected #276 database identity; native HTTP test halted.");
    }
  } finally {
    await pool.end();
  }
}

beforeAll(async () => {
  await proveIsolatedParent();
  await fixture.start();
}, 120_000);
afterAll(() => fixture.stop(), 60_000);

async function locationManager() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    role: "LOCATION_MANAGER",
  });
  const location = await fixture.addLocation(membership.organizationId);
  await fixture.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id)" +
    " VALUES($1,$2,$3)",
    [membership.organizationId, membership.membershipId, location.locationId],
  );
  const auth = await fixture.nativeLogin(user);
  const target = "/v1/staff/dashboard/locations/" + location.locationId +
    "/overview/live-sessions?limit=50";
  return { auth, membership, location, target, user };
}

function live(target: string, accessToken?: string) {
  return fixture.request(target, {
    ...(accessToken ? { authorization: "Bearer " + accessToken } : {}),
    method: "GET",
  });
}

describe.runIf(isolatedLiveHistoryLabConfigured())(
  "#276 actual Nest HTTP route and native writers", () => {
  it("fails closed without bearer, denies foreign location and supports live LM", async () => {
    const manager = await locationManager();
    const denied = await live(manager.target);
    expect(denied.status).toBe(401);
    const allowed = await live(manager.target, manager.auth.accessToken);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ items: [], nextCursor: null });
    const foreignOrg = await fixture.createOrganization();
    const foreign = await fixture.addLocation(foreignOrg);
    const response = await live(
      "/v1/staff/dashboard/locations/" + foreign.locationId +
      "/overview/live-sessions?limit=50",
      manager.auth.accessToken,
    );
    expect(response.status).not.toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(foreignOrg);
  });

  it("native refresh invalidates old access and native logout revokes replacement", async () => {
    const manager = await locationManager();
    expect((await live(manager.target, manager.auth.accessToken)).status).toBe(200);
    const refreshed = await fixture.refresh(manager.auth.refreshToken);
    expect(refreshed.status).toBe(200);
    expect((await live(manager.target, manager.auth.accessToken)).status).not.toBe(200);
    const replacement = String(refreshed.body?.accessToken);
    const replacementRefresh = String(refreshed.body?.refreshToken);
    expect(replacement).toMatch(/^vsa1\./);
    expect(replacementRefresh).toMatch(/^vsr1\./);
    expect((await live(manager.target, replacement)).status).toBe(200);
    const logout = await fixture.logout(replacementRefresh);
    expect(logout.status).toBe(204);
    expect((await live(manager.target, replacement)).status).not.toBe(200);
  });

  it("Company Admin Live read requires current MFA; unauthorized location has no MFA oracle", async () => {
    const manager = await locationManager();
    const caUser = await fixture.createUser();
    await fixture.addMembership(manager.membership.organizationId, caUser.id, "ORG_ADMIN");
    const admin = await fixture.nativeLogin(caUser);
    const noFactor = await live(manager.target, admin.accessToken);
    expect(noFactor.status).not.toBe(200);
    const foreignOrg = await fixture.createOrganization();
    const foreign = await fixture.addLocation(foreignOrg);
    const blocked = await live(
      "/v1/staff/dashboard/locations/" + foreign.locationId +
      "/overview/live-sessions?limit=50",
      admin.accessToken,
    );
    expect(blocked.status).not.toBe(200);
    expect(JSON.stringify(blocked.body)).not.toContain("MFA_STEP_UP_REQUIRED");
    const factor = await fixture.enrollAndAssure(admin);
    expect((await fixture.stepUp(admin, factor.secret)).status).toBe(200);
    expect((await live(manager.target, admin.accessToken)).status).toBe(200);
  });

  it("native Company Admin grant revocation removes LM Live authority", async () => {
    const manager = await locationManager();
    const adminUser = await fixture.createUser();
    await fixture.addMembership(
      manager.membership.organizationId, adminUser.id, "ORG_ADMIN",
    );
    const admin = await fixture.nativeLogin(adminUser);
    const factor = await fixture.enrollAndAssure(admin);
    const assured = await fixture.stepUp(admin, factor.secret);
    expect(assured.status).toBe(200);
    expect((await live(manager.target, manager.auth.accessToken)).status).toBe(200);
    const revoke = await fixture.managementPost(
      "/v1/staff/management/organizations/" + manager.membership.organizationId +
      "/staff/" + manager.membership.membershipId + "/location-access/revoke",
      admin.accessToken,
      { expectedVersion: 1, locationIds: [manager.location.locationId] },
    );
    expect(revoke.status).toBe(201);
    expect((await live(manager.target, manager.auth.accessToken)).status).not.toBe(200);
  });

  it.each([
    ["role", { expectedVersion: 1, role: "VALET_SUPERVISOR" }],
    ["deactivate", { expectedVersion: 1 }],
  ])("actual Company Admin %s writer invalidates Live history access", async (action, body) => {
    const manager = await locationManager();
    const user = await fixture.createUser();
    await fixture.addMembership(manager.membership.organizationId, user.id, "ORG_ADMIN");
    const auth = await fixture.nativeLogin(user);
    const factor = await fixture.enrollAndAssure(auth);
    expect((await fixture.stepUp(auth, factor.secret)).status).toBe(200);
    expect((await live(manager.target, manager.auth.accessToken)).status).toBe(200);
    const response = await fixture.managementPost(
      "/v1/staff/management/organizations/" + manager.membership.organizationId +
      "/staff/" + manager.membership.membershipId + "/" + action,
      auth.accessToken,
      body,
    );
    expect(response.status).toBe(201);
    expect((await live(manager.target, manager.auth.accessToken)).status).not.toBe(200);
  }, 30_000);

  it("actual Company Admin HTTP revoker waits for a Live reader and denies afterward", async () => {
    const manager = await locationManager();
    const adminUser = await fixture.createUser();
    await fixture.addMembership(
      manager.membership.organizationId, adminUser.id, "ORG_ADMIN",
    );
    const admin = await fixture.nativeLogin(adminUser);
    const factor = await fixture.enrollAndAssure(admin);
    expect((await fixture.stepUp(admin, factor.secret)).status).toBe(200);

    const reader = await fixture.databasePool().connect();
    let started = false;
    try {
      await reader.query("BEGIN");
      started = true;
      const session = await fixture.query<{ created_at: Date }>(
        "SELECT created_at FROM staff_auth_sessions WHERE id=$1",
        [manager.auth.sessionId],
      );
      const scope = await authorizeLiveHistoryLocation(reader as PostgresTransaction, {
        authenticatedUserId: manager.user.id,
        staffSessionContext: {
          accessTokenHash: staffCredentialHash("access", manager.auth.accessToken),
          createdAt: session.rows[0]!.created_at,
          staffAuthSessionId: manager.auth.sessionId,
          userId: manager.user.id,
        },
        targetLocationId: manager.location.locationId,
      });
      expect(scope).toMatchObject({
        organizationId: manager.membership.organizationId,
        locationId: manager.location.locationId,
      });

      const writer = fixture.managementPost(
        "/v1/staff/management/organizations/" + manager.membership.organizationId +
        "/staff/" + manager.membership.membershipId + "/location-access/revoke",
        admin.accessToken,
        { expectedVersion: 1, locationIds: [manager.location.locationId] },
      );
      await expect.poll(async () => {
        const waiting = await fixture.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM pg_stat_activity " +
          "WHERE datname=current_database() AND wait_event_type='Lock'",
        );
        return waiting.rows[0]?.count ?? 0;
      }, { interval: 30, timeout: 10_000 }).toBeGreaterThan(0);
      await reader.query("COMMIT");
      started = false;
      expect((await writer).status).toBe(201);
    } finally {
      if (started) await reader.query("ROLLBACK");
      reader.release();
    }
    expect((await live(manager.target, manager.auth.accessToken)).status).not.toBe(200);
  }, 30_000);

  it("actual Location lifecycle commands revoke Live access after deactivation", async () => {
    const manager = await locationManager();
    const user = await fixture.createUser();
    await fixture.addMembership(manager.membership.organizationId, user.id, "ORG_ADMIN");
    const ca = await fixture.nativeLogin(user);
    const factor = await fixture.enrollAndAssure(ca);
    expect((await fixture.stepUp(ca, factor.secret)).status).toBe(200);
    const path = "/v1/staff/management/organizations/" + manager.membership.organizationId +
      "/locations/" + manager.location.locationId;
    expect((await live(manager.target, manager.auth.accessToken)).status).toBe(200);
    const before = await fixture.managementGet(path + "/lifecycle", ca.accessToken);
    expect(before.status).toBe(200);
    const stopped = await fixture.managementPost(path + "/stop-intake", ca.accessToken,
      { expectedUpdatedAt: before.body?.updatedAt });
    expect(stopped.status).toBe(201);
    const inactive = await fixture.managementPost(path + "/deactivate", ca.accessToken,
      { expectedUpdatedAt: stopped.body?.updatedAt });
    expect(inactive.status).toBe(201);
    expect((await live(manager.target, manager.auth.accessToken)).status).not.toBe(200);
  }, 30_000);

  it("measures authenticated requests without inventing an endpoint SLA", async () => {
    const manager = await locationManager();
    await fixture.query(
      "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) " +
      "SELECT overlay(overlay(md5($1::text||':vehicle:'||n) " +
      "placing '4' from 13) placing '8' from 17)::uuid," +
      "$1::uuid,'Synthetic ' || n::text, " +
      "clock_timestamp() FROM generate_series(1,50) AS n",
      [manager.membership.organizationId],
    );
    await fixture.query(
      "INSERT INTO valet_sessions (id,organization_id,location_id,vehicle_id,state," +
      "checked_in_by_membership_id,version,updated_at," +
      "customer_access_token_hash,customer_access_expires_at) " +
      "SELECT overlay(overlay(md5($1::text||':session:'||n) " +
      "placing '4' from 13) placing '8' from 17)::uuid,$1::uuid,$2::uuid," +
      "overlay(overlay(md5($1::text||':vehicle:'||n) " +
      "placing '4' from 13) placing '8' from 17)::uuid,'PARKED',$3::uuid,1," +
      "clock_timestamp(),md5($1::text||':token:'||n)," +
      "clock_timestamp()+interval '1 hour' FROM generate_series(1,50) AS n",
      [
        manager.membership.organizationId,
        manager.location.locationId,
        manager.membership.membershipId,
      ],
    );
    const preflight = await live(manager.target, manager.auth.accessToken);
    expect(preflight.status).toBe(200);
    for (const concurrency of [1, 4, 8]) {
      const started = performance.now();
      const results = await Promise.all(Array.from({ length: concurrency }, async () => {
        const individual = performance.now();
        const response = await live(manager.target, manager.auth.accessToken);
        expect(response.status).toBe(200);
        const items = response.body?.items;
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(50);
        expect(items).toEqual(expect.arrayContaining([
          expect.objectContaining({ parkingCompletionProof: "NO_RECORD", parkedBy: null }),
        ]));
        return performance.now() - individual;
      }));
      console.log("[#276 AUTH HTTP synthetic 50-session NO_RECORD page]", JSON.stringify({
        concurrency, pageSessions: 50,
        fullEndpointWallMs: Number((performance.now() - started).toFixed(2)),
        maxRequestMs: Number(Math.max(...results).toFixed(2)),
      }));
    }
  });
});
