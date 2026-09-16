import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migration = "20260916003700_mgt_be_04_staff_roles_access";
const suffix = randomUUID().replaceAll("-", "");
const freshName = `valet_staff_mgt_fresh_${suffix}`;
const upgradeName = `valet_staff_mgt_upgrade_${suffix}`;
const clients: Client[] = [];
let fresh: Client;
let upgrade: Client;
let existingMembershipId: string;

function scopedUrl(name: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function createDatabase(name: string): Promise<Client> {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${name}"`);
  } finally {
    await bootstrap.end();
  }
  const client = new Client({ connectionString: scopedUrl(name) });
  await client.connect();
  clients.push(client);
  return client;
}

async function apply(client: Client, name: string): Promise<void> {
  await client.query(
    await readFile(new URL(`${name}/migration.sql`, migrationRoot), "utf8"),
  );
}

beforeAll(async () => {
  fresh = await createDatabase(freshName);
  for (const name of expectedMigrationDirectories) await apply(fresh, name);

  upgrade = await createDatabase(upgradeName);
  for (const name of expectedMigrationDirectories.slice(0, -1)) {
    await apply(upgrade, name);
  }
  const organizationId = randomUUID();
  const userId = randomUUID();
  existingMembershipId = randomUUID();
  await upgrade.query(
    `INSERT INTO organizations(id,name,timezone,updated_at)
     VALUES($1,'Upgrade org','Asia/Amman',transaction_timestamp())`,
    [organizationId],
  );
  await upgrade.query(
    `INSERT INTO users(id,email,password_hash,updated_at)
     VALUES($1,$2,'test-hash',transaction_timestamp())`,
    [userId, `${userId}@upgrade.test`],
  );
  await upgrade.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',transaction_timestamp())`,
    [existingMembershipId, organizationId, userId],
  );
  await apply(upgrade, migration);
}, 120_000);

afterAll(async () => {
  for (const client of clients) await client.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${freshName}" WITH (FORCE)`);
    await bootstrap.query(`DROP DATABASE "${upgradeName}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("MGT-BE-04 Staff management migration 37", () => {
  it("applies all 37 forward migrations from empty state", async () => {
    expect(expectedMigrationDirectories).toHaveLength(37);
    expect(expectedMigrationDirectories.at(-1)).toBe(migration);
    const column = await fresh.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_schema='public' AND table_name='organization_memberships'
         AND column_name='version'`,
    );
    expect(column.rows[0]?.column_default).toContain("1");
  });

  it("upgrades existing membership state without fabricated lifecycle or audit", async () => {
    const membership = await upgrade.query<{
      role: string;
      status: string;
      version: number;
    }>(
      `SELECT role::text,status::text,version
       FROM organization_memberships WHERE id=$1`,
      [existingMembershipId],
    );
    expect(membership.rows[0]).toEqual({
      role: "VALET_EMPLOYEE",
      status: "ACTIVE",
      version: 1,
    });
    const audit = await upgrade.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE entity_id=$1`,
      [existingMembershipId],
    );
    expect(audit.rows[0]?.count).toBe("0");
  });

  it("installs private helpers and narrow command functions with PUBLIC denied", async () => {
    for (const functionName of [
      "staff_management_set_role(uuid,uuid,uuid,integer,membership_role)",
      "staff_management_set_status(uuid,uuid,uuid,integer,membership_status)",
      "staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)",
      "staff_management_authorize_actor(uuid,uuid)",
    ]) {
      const result = await fresh.query<{ public_denied: boolean; security_definer: boolean }>(
        `SELECT function.prosecdef AS security_definer,
                NOT EXISTS (
                  SELECT 1
                  FROM aclexplode(COALESCE(function.proacl, acldefault('f', function.proowner))) AS privilege
                  WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
                ) AS public_denied
         FROM pg_proc AS function WHERE function.oid=to_regprocedure($1)`,
        [functionName],
      );
      expect(result.rows[0]).toEqual({
        public_denied: true,
        security_definer: true,
      });
    }
  });

  it("fails closed on nullable CAS and Location grant mode inputs", async () => {
    const organizationId = randomUUID();
    const locationId = randomUUID();
    const actorUserId = randomUUID();
    const actorMembershipId = randomUUID();
    const targetUserId = randomUUID();
    const targetMembershipId = randomUUID();
    await fresh.query(
      `INSERT INTO organizations(id,name,timezone,updated_at)
       VALUES($1,'Boundary org','Asia/Amman',transaction_timestamp())`,
      [organizationId],
    );
    await fresh.query(
      `INSERT INTO locations
         (id,organization_id,name,code,address_text,timezone,currency,updated_at)
       VALUES($1,$2,'Boundary location',$3,'Address','Asia/Amman','JOD',transaction_timestamp())`,
      [locationId, organizationId, `B-${locationId}`],
    );
    await fresh.query(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES($1,$2,'test-hash',transaction_timestamp()),
             ($3,$4,'test-hash',transaction_timestamp())`,
      [
        actorUserId,
        `${actorUserId}@boundary.test`,
        targetUserId,
        `${targetUserId}@boundary.test`,
      ],
    );
    await fresh.query(
      `INSERT INTO organization_memberships
         (id,organization_id,user_id,role,status,updated_at)
       VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',transaction_timestamp()),
             ($4,$2,$5,'VALET_EMPLOYEE','ACTIVE',transaction_timestamp())`,
      [actorMembershipId, organizationId, actorUserId, targetMembershipId, targetUserId],
    );
    await fresh.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [organizationId, targetMembershipId, locationId],
    );
    await fresh.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
       VALUES($1,$2,$3,$4,'ACTIVE',transaction_timestamp())`,
      [randomUUID(), organizationId, locationId, targetMembershipId],
    );

    const role = await fresh.query<{ changed: boolean; result_code: string; version: number }>(
      `SELECT * FROM staff_management_set_role(
         $1,$2,$3,NULL::integer,'VALET_SUPERVISOR'::membership_role
       )`,
      [actorMembershipId, organizationId, targetMembershipId],
    );
    expect(role.rows[0]).toEqual({ changed: false, result_code: "VERSION_CONFLICT", version: 1 });
    const status = await fresh.query<{
      changed: boolean;
      result_code: string;
      version: number;
    }>(
      `SELECT * FROM staff_management_set_status(
         $1,$2,$3,NULL::integer,'INACTIVE'::membership_status
       )`,
      [actorMembershipId, organizationId, targetMembershipId],
    );
    expect(status.rows[0]).toEqual({
      changed: false,
      result_code: "VERSION_CONFLICT",
      version: 1,
    });
    await expect(
      fresh.query(
        `SELECT * FROM staff_management_set_location_access(
           $1,$2,$3,1,ARRAY[$4]::uuid[],NULL::boolean
         )`,
        [actorMembershipId, organizationId, targetMembershipId, locationId],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    const unchanged = await fresh.query<{ access_count: number; version: number }>(
      `SELECT membership.version,
              (SELECT count(*)::integer FROM membership_location_access AS access
               WHERE access.membership_id=membership.id) AS access_count
       FROM organization_memberships AS membership WHERE membership.id=$1`,
      [targetMembershipId],
    );
    expect(unchanged.rows[0]).toEqual({ access_count: 1, version: 1 });
  });
});
