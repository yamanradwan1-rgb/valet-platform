import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

/**
 * An explicitly owned cluster is mandatory. Never silently use the default
 * valet database, CI database, shared local service, or #276's separate lab.
 */
const labDirectory = process.env.ISSUE315_PG_PRIVATE_DATADIR?.replaceAll("\\", "/");
const labUrl = process.env.TEST_DATABASE_URL ?? "";
function optInValid(): boolean {
  if (process.platform !== "win32" || process.env.CI === "true" ||
      process.env.ISSUE315_EPHEMERAL_PG !== "I_OWN_THIS_CLUSTER" ||
      !labDirectory?.includes("/tmp/issue-315") ||
      !labDirectory.endsWith("/.issue315-private-cluster") ||
      labUrl !== process.env.MIGRATION_DATABASE_URL) return false;
  try {
    const url = new URL(labUrl);
    return url.protocol === "postgresql:" && url.hostname === "127.0.0.1" &&
      url.username === "issue315_owner" && url.password.length > 0 &&
      url.pathname === "/postgres" && url.search === "" && url.hash === "" &&
      Number(url.port) >= 1024 && ![5432, 55449].includes(Number(url.port));
  } catch { return false; }
}
const labEnabled = optInValid();

type Scenario = {
  adminMembershipId: string;
  context: StaffSessionContext;
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
};
type Revocation = (client: PoolClient, scenario: Scenario) => Promise<void>;
const base = labEnabled ? new ManagementControlPlaneTestFixture() : undefined;
const scope = (scenario: Scenario) => ({
  locationId: scenario.locationId,
  membershipId: scenario.membershipId,
  organizationId: scenario.organizationId,
});

async function assertOwnedCluster(): Promise<void> {
  const pg = new Pool({ connectionString: labUrl });
  try {
    const checked = await pg.query<{
      database: string; directory: string; port: number; username: string;
    }>(`SELECT current_database() AS database, current_user AS username,
              inet_server_port() AS port, current_setting('data_directory') AS directory`);
    expect(checked.rows[0]).toMatchObject({
      database: "postgres", port: Number(new URL(labUrl).port),
      username: "issue315_owner",
    });
    expect(checked.rows[0]!.directory.replaceAll("\\", "/")).toBe(labDirectory);
    expect((await pg.query("SHOW transaction_isolation")).rows[0]?.transaction_isolation)
      .toBe("read committed");
  } finally {
    await pg.end();
  }
}

async function createScenario(): Promise<Scenario> {
  const fixture = base!;
  const actor = await fixture.createUser();
  const membership = await fixture.createMembership(actor.id, { role: "LOCATION_MANAGER" });
  const location = await fixture.addLocation(membership.organizationId);
  const admin = await fixture.createUser();
  const adminMembershipId = await fixture.addMembership(membership.organizationId, admin.id, "ORG_ADMIN");
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [membership.organizationId, membership.membershipId, location.locationId],
  );
  const auth = await fixture.nativeLogin(actor);
  const session = await fixture.query<{ created_at: Date }>(
    "SELECT created_at FROM staff_auth_sessions WHERE id=$1", [auth.sessionId],
  );
  return {
    adminMembershipId,
    context: {
      accessTokenHash: staffCredentialHash("access", auth.accessToken),
      createdAt: session.rows[0]!.created_at,
      staffAuthSessionId: auth.sessionId,
      userId: actor.id,
    },
    locationId: location.locationId, membershipId: membership.membershipId,
    organizationId: membership.organizationId, sessionId: auth.sessionId,
    userId: actor.id,
  };
}

async function read(client: PoolClient, actor: Scenario,
  capability: "LOCATION_DASHBOARD_READ" | "ANALYTICS_READ" | "REPORTS_READ" = "LOCATION_DASHBOARD_READ") {
  return authorizeDashboardReadLocation(client, {
    authenticatedUserId: actor.userId,
    capability,
    staffSessionContext: actor.context,
    targetLocationId: actor.locationId,
  });
}

async function getClient(): Promise<PoolClient> {
  const client = await base!.databasePool().connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout='6s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout='12s'");
  return client;
}

async function dispose(clients: readonly PoolClient[]) {
  for (const client of clients) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function exclusiveOrg(client: PoolClient, actor: Scenario) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`,
    [actor.organizationId],
  );
}

const rawRevoke: Revocation = (client, actor) =>
  client.query("DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
    [actor.membershipId, actor.locationId]).then(() => undefined);
const managedRevoke: Revocation = async (client, actor) => {
  await exclusiveOrg(client, actor);
  await rawRevoke(client, actor);
};
const canonicalRevoke: Revocation = async (client, actor) => {
  const version = await client.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1", [actor.membershipId],
  );
  const result = await client.query<{ result_code: string }>(
    `SELECT result_code FROM staff_management_set_location_access(
       $1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid[],$6::boolean)`,
    [actor.adminMembershipId, actor.organizationId, actor.membershipId,
      version.rows[0]!.version, [actor.locationId], false],
  );
  expect(result.rows[0]?.result_code).toBe("OK");
};
const revokedRole: Revocation = async (client, actor) => {
  await exclusiveOrg(client, actor);
  await client.query("UPDATE organization_memberships SET role='VALET_SUPERVISOR' WHERE id=$1",
    [actor.membershipId]);
};
const inactiveLocation: Revocation = async (client, actor) => {
  await exclusiveOrg(client, actor);
  await client.query("UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1", [actor.locationId]);
};
async function readFirst(actor: Scenario, revoke: Revocation) {
  const reader = await getClient();
  const revoker = await getClient();
  try {
    expect(await read(reader, actor)).toEqual(scope(actor));
    // The side channel is a separate client; do not let the pending query
    // block its own pg_stat_activity probe.
    const pid = Number((await revoker.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid);
    const pending = revoke(revoker, actor);
    await expect.poll(async () => (await base!.query<{ wait_event_type: string | null }>(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid],
    )).rows[0]?.wait_event_type, { timeout: 1500, interval: 30 }).toBe("Lock");
    await reader.query("COMMIT");
    await pending;
    await revoker.query("COMMIT");
    const fresh = await getClient();
    try { expect(await read(fresh, actor)).toBeNull(); } finally { await dispose([fresh]); }
  } finally { await dispose([reader, revoker]); }
}

async function revokerFirst(actor: Scenario, revoke: Revocation) {
  const reader = await getClient();
  const revoker = await getClient();
  try {
    await revoke(revoker, actor);
    const pid = Number((await reader.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid);
    const pending = read(reader, actor);
    await expect.poll(async () => (await base!.query<{ wait_event_type: string | null }>(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid],
    )).rows[0]?.wait_event_type, { timeout: 1500, interval: 30 }).toBe("Lock");
    await revoker.query("COMMIT");
    expect(await pending).toBeNull();
  } finally { await dispose([reader, revoker]); }
}

describe.runIf(labEnabled)("Issue #315 isolated PG grant/read race", () => {
  beforeAll(async () => { await assertOwnedCluster(); await base!.start(); }, 150_000);
  afterAll(async () => { await base!.stop(); }, 90_000);

  it.each([
    { name: "actual SECURITY DEFINER staff_management_set_location_access writer", revoke: canonicalRevoke },
    { name: "managed advisory grant revoke", revoke: managedRevoke },
    { name: "membership role change", revoke: revokedRole },
    { name: "Location deactivation", revoke: inactiveLocation },
  ])("reader-first: $name waits until reader commits", async ({ revoke }) => {
    await readFirst(await createScenario(), revoke);
  }, 25_000);

  it.each([
    { name: "actual SECURITY DEFINER grant revoke", revoke: canonicalRevoke },
    { name: "managed advisory DELETE", revoke: managedRevoke },
    { name: "membership role downgrade", revoke: revokedRole },
    { name: "Location disabled", revoke: inactiveLocation },
  ])("revoker-first: $name waits then denies", async ({ revoke }) => {
    await revokerFirst(await createScenario(), revoke);
  }, 25_000);

  it("denies cross-tenant and ungranted Location", async () => {
    const actor = await createScenario();
    const stranger = await base!.createMembership((await base!.createUser()).id, { role: "LOCATION_MANAGER" });
    const foreign = await base!.addLocation(stranger.organizationId);
    const ungranted = await base!.addLocation(actor.organizationId);
    const client = await getClient();
    try {
      for (const locationId of [foreign.locationId, ungranted.locationId]) {
        expect(await authorizeDashboardReadLocation(client, {
          authenticatedUserId: actor.userId, capability: "LOCATION_DASHBOARD_READ",
          staffSessionContext: actor.context, targetLocationId: locationId,
        })).toBeNull();
      }
    } finally { await dispose([client]); }
  });

  it.each(["LOCATION_DASHBOARD_READ", "ANALYTICS_READ", "REPORTS_READ"] as const)(
    "accepts authorized, active LM for %s", async capability => {
      const actor = await createScenario();
      const reader = await getClient();
      try { expect(await read(reader, actor, capability)).toEqual(scope(actor)); }
      finally { await dispose([reader]); }
    },
  );

  it("documents residual raw privileged DELETE bypass without advisory participation", async () => {
    const actor = await createScenario();
    const reader = await getClient();
    const revoker = await getClient();
    try {
      expect(await read(reader, actor)).toEqual(scope(actor));
      // This is explicitly NOT a managed writer. A direct privileged DELETE
      // bypasses W1's org advisory and therefore can commit mid-read.
      await rawRevoke(revoker, actor);
      await revoker.query("COMMIT");
      expect(await read(reader, actor)).toBeNull();
      const fresh = await getClient();
      try { expect(await read(fresh, actor)).toBeNull(); }
      finally { await dispose([fresh]); }
    } finally { await dispose([reader, revoker]); }
  });

  it("two independent readers retain SHARE advisory while managed revoker waits", async () => {
    const actor = await createScenario();
    const sibling = await base!.createUser();
    const membershipId = await base!.addMembership(actor.organizationId, sibling.id, "LOCATION_MANAGER");
    await base!.query(
      "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
      [actor.organizationId, membershipId, actor.locationId],
    );
    const session = await base!.nativeLogin(sibling);
    const created = await base!.query<{ created_at: Date }>(
      "SELECT created_at FROM staff_auth_sessions WHERE id=$1", [session.sessionId],
    );
    const second = { ...actor, userId: sibling.id, membershipId, sessionId: session.sessionId,
      context: { userId: sibling.id, staffAuthSessionId: session.sessionId,
        createdAt: created.rows[0]!.created_at,
        accessTokenHash: staffCredentialHash("access", session.accessToken) } };
    const [first, other, writer] = await Promise.all([getClient(), getClient(), getClient()]);
    try {
      expect(await read(first, actor)).toEqual(scope(actor));
      expect(await read(other, second)).toEqual(scope(second));
      const pid = Number((await writer.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid);
      const pending = canonicalRevoke(writer, actor);
      await expect.poll(async () => (await base!.query<{ wait_event_type: string | null }>(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid],
      )).rows[0]?.wait_event_type, { timeout: 1800, interval: 30 }).toBe("Lock");
      await first.query("COMMIT");
      await expect.poll(async () => (await base!.query<{ wait_event_type: string | null }>(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid],
      )).rows[0]?.wait_event_type, { timeout: 1000, interval: 30 }).toBe("Lock");
      await other.query("COMMIT");
      await pending;
      await writer.query("COMMIT");
    } finally { await dispose([first, other, writer]); }
  }, 25_000);
});
