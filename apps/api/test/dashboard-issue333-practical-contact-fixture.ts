import { Pool } from "pg";
import { expect } from "vitest";

import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

export const contacts = new ManagementVisitContactTestFixture();
let attempted = false;

export async function startPracticalContacts() {
  const url = process.env.TEST_DATABASE_URL ?? "";
  const directory = process.env.ISSUE333_PG_PRIVATE_DATADIR?.replaceAll(
    "\\",
    "/",
  );
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    throw new Error("Practical Issue333 contacts require owned PostgreSQL17.");
  }
  if (
    process.platform !== "win32" ||
    process.env.CI === "true" ||
    process.env.ISSUE333_EPHEMERAL_PG !== "I_OWN_THIS_CLUSTER" ||
    url !== process.env.MIGRATION_DATABASE_URL ||
    address.protocol !== "postgresql:" ||
    address.hostname !== "127.0.0.1" ||
    address.username !== "issue315_owner" ||
    address.pathname !== "/postgres" ||
    !address.password ||
    address.search !== "" ||
    address.hash !== "" ||
    Number(address.port) <= 1024 ||
    Number(address.port) === 5432 ||
    !directory?.includes("/tmp/issue-315-pg-qa/issue319-") ||
    !directory.endsWith("/.issue315-private-cluster")
  ) {
    throw new Error("Practical Issue333 contacts PG ownership check failed.");
  }
  const admin = new Pool({ connectionString: url, max: 1 });
  try {
    const observed = await admin.query<{
      database: string;
      directory: string;
      port: number;
      role: string;
      version: number;
    }>(`SELECT current_database() AS database, current_user AS role,
       inet_server_port() AS port, current_setting('data_directory') AS directory,
       current_setting('server_version_num')::int AS version`);
    expect(observed.rows[0]).toMatchObject({
      database: "postgres",
      port: Number(address.port),
      role: "issue315_owner",
    });
    expect(observed.rows[0]!.directory.replaceAll("\\", "/")).toBe(directory);
    expect(observed.rows[0]!.version).toBeGreaterThanOrEqual(170000);
    expect(observed.rows[0]!.version).toBeLessThan(180000);
  } finally {
    await admin.end();
  }
  attempted = true;
  await contacts.start();
  const runtime = new Pool({
    connectionString: contacts.runtimeDatabaseUrl(),
    max: 1,
  });
  try {
    const privileges = await runtime.query(
      `SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles
       WHERE rolname=current_user`,
    );
    expect(privileges.rows[0]).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
  } finally {
    await runtime.end();
  }
}

export async function stopPracticalContacts() {
  if (attempted) await contacts.stop();
}

export async function practicalContactScenario() {
  const user = await contacts.createUser();
  const organizationId = await contacts.createOrganization();
  const membershipId = await contacts.addMembership(
    organizationId,
    user.id,
    "LOCATION_MANAGER",
  );
  const a = (await contacts.addLocation(organizationId)).locationId;
  const b = (await contacts.addLocation(organizationId)).locationId;
  await contacts.grantLocationAccess(organizationId, membershipId, a);
  await contacts.grantLocationAccess(organizationId, membershipId, b);
  const manager = await contacts.nativeLogin(user);
  const adminUser = await contacts.createUser();
  await contacts.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
  const admin = await contacts.nativeLogin(adminUser);
  await contacts.enrollAndAssure(admin);
  return { a, b, admin, manager, membershipId, organizationId };
}

export async function practicalRevoke(
  subject: Awaited<ReturnType<typeof practicalContactScenario>>,
) {
  const version = await contacts.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1",
    [subject.membershipId],
  );
  const response = await contacts.managementPost(
    `/v1/staff/management/organizations/${subject.organizationId}/staff/${subject.membershipId}/location-access/revoke`,
    subject.admin.accessToken,
    { expectedVersion: version.rows[0]!.version, locationIds: [subject.a] },
  );
  expect(response.status).toBe(201);
  const remaining = await contacts.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM membership_location_access
     WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
    [subject.organizationId, subject.membershipId, subject.a],
  );
  expect(remaining.rows[0]?.count).toBe("0");
}
