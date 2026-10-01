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
const migration = "20261001005000_mgt_240b_lm_staff_authority";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const beforeM4 = expectedMigrationDirectories.slice(0, migrationIndex);
const databaseName = `valet_240b_${randomUUID().replaceAll("-", "")}`;
let client: Client;

const ids = {
  adminMembership: randomUUID(),
  adminUser: randomUUID(),
  elevatedMembership: randomUUID(),
  elevatedUser: randomUUID(),
  employeeMembership: randomUUID(),
  employeeUser: randomUUID(),
  lmMembership: randomUUID(),
  lmUser: randomUUID(),
  locationA: randomUUID(),
  locationB: randomUUID(),
  locationC: randomUUID(),
  organization: randomUUID(),
  zeroMembership: randomUUID(),
  zeroUser: randomUUID(),
};

function scopedUrl(): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function apply(name: string): Promise<void> {
  await client.query(
    await readFile(new URL(`${name}/migration.sql`, migrationRoot), "utf8"),
  );
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  client = new Client({ connectionString: scopedUrl() });
  await client.connect();
  for (const name of beforeM4) await apply(name);
  await client.query(
    `INSERT INTO organizations(id,name,timezone,updated_at)
     VALUES($1,'T05-B org','Asia/Amman',clock_timestamp())`,
    [ids.organization],
  );
  await client.query(
    `INSERT INTO locations
       (id,organization_id,name,code,address_text,timezone,currency,status,accepting_intake,updated_at)
     VALUES($1,$4,'A','A','Address','Asia/Amman','JOD','ACTIVE',TRUE,clock_timestamp()),
           ($2,$4,'B','B','Address','Asia/Amman','JOD','ACTIVE',TRUE,clock_timestamp()),
           ($3,$4,'C','C','Address','Asia/Amman','JOD','ACTIVE',TRUE,clock_timestamp())`,
    [ids.locationA, ids.locationB, ids.locationC, ids.organization],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,updated_at) VALUES
      ($1,$7,'fixture',clock_timestamp()),($2,$8,'fixture',clock_timestamp()),
      ($3,$9,'fixture',clock_timestamp()),($4,$10,'fixture',clock_timestamp()),
      ($5,$11,'fixture',clock_timestamp()),($6,$12,'fixture',clock_timestamp())`,
    [
      ids.adminUser,
      ids.lmUser,
      ids.employeeUser,
      ids.zeroUser,
      ids.elevatedUser,
      randomUUID(),
      `${ids.adminUser}@test`,
      `${ids.lmUser}@test`,
      `${ids.employeeUser}@test`,
      `${ids.zeroUser}@test`,
      `${ids.elevatedUser}@test`,
      `${randomUUID()}@test`,
    ],
  );
  await client.query(
    `INSERT INTO organization_memberships
       (id,organization_id,user_id,role,status,updated_at) VALUES
      ($1,$7,$2,'ORG_ADMIN','ACTIVE',clock_timestamp()),
      ($3,$7,$4,'LOCATION_MANAGER','ACTIVE',clock_timestamp()),
      ($5,$7,$6,'VALET_EMPLOYEE','ACTIVE',clock_timestamp()),
      ($8,$7,$9,'VALET_EMPLOYEE','ACTIVE',clock_timestamp()),
      ($10,$7,$11,'LOCATION_MANAGER','ACTIVE',clock_timestamp())`,
    [
      ids.adminMembership,
      ids.adminUser,
      ids.lmMembership,
      ids.lmUser,
      ids.employeeMembership,
      ids.employeeUser,
      ids.organization,
      ids.zeroMembership,
      ids.zeroUser,
      ids.elevatedMembership,
      ids.elevatedUser,
    ],
  );
  await client.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$4),($1,$2,$5),($1,$3,$4),($1,$6,$4)`,
    [
      ids.organization,
      ids.lmMembership,
      ids.employeeMembership,
      ids.locationA,
      ids.locationB,
      ids.elevatedMembership,
    ],
  );
  await apply(migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("T05-B migration 050 LM staff authority", () => {
  it("upgrades 049 forward and keeps private helpers non-public", async () => {
    expect(beforeM4.at(-1)).toBe("20261001004900_mgt_240a_staff_identity");
    for (const name of [
      "staff_management_authorize_staff_actor(uuid,uuid)",
      "staff_management_lock_lm_active_grants(uuid,uuid)",
      "staff_management_lm_target_covered(uuid,uuid,uuid)",
    ]) {
      const result = await client.query<{
        publicDenied: boolean;
        securityDefiner: boolean;
      }>(
        `SELECT function.prosecdef AS "securityDefiner",
                NOT EXISTS (
                  SELECT 1 FROM aclexplode(COALESCE(function.proacl, acldefault('f', function.proowner))) p
                  WHERE p.grantee=0 AND p.privilege_type='EXECUTE'
                ) AS "publicDenied"
         FROM pg_proc AS function WHERE function.oid=to_regprocedure($1)`,
        [name],
      );
      expect(result.rows[0]).toEqual({
        publicDenied: true,
        securityDefiner: true,
      });
    }
  });

  it("preserves Company Admin behavior and adds covered Employee/Supervisor LM transitions", async () => {
    const ca = await client.query(
      `SELECT * FROM staff_management_set_role($1,$2,$3,1,'VALET_SUPERVISOR')`,
      [ids.adminMembership, ids.organization, ids.zeroMembership],
    );
    expect(ca.rows[0]).toMatchObject({
      changed: true,
      result_code: "OK",
      version: 2,
    });
    const lm = await client.query(
      `SELECT * FROM staff_management_set_role($1,$2,$3,1,'VALET_SUPERVISOR')`,
      [ids.lmMembership, ids.organization, ids.employeeMembership],
    );
    expect(lm.rows[0]).toMatchObject({
      changed: true,
      result_code: "OK",
      version: 2,
    });
    const retry = await client.query(
      `SELECT * FROM staff_management_set_role($1,$2,$3,1,'VALET_SUPERVISOR')`,
      [ids.lmMembership, ids.organization, ids.employeeMembership],
    );
    expect(retry.rows[0]).toMatchObject({
      changed: false,
      result_code: "OK",
      version: 2,
    });
  });

  it("conceals self/elevated/zero/mixed targets before desired-state no-op", async () => {
    for (const membershipId of [
      ids.lmMembership,
      ids.elevatedMembership,
      ids.zeroMembership,
    ]) {
      await expect(
        client.query(
          `SELECT * FROM staff_management_set_status($1,$2,$3,1,'ACTIVE')`,
          [ids.lmMembership, ids.organization, membershipId],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await client.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [ids.organization, ids.employeeMembership, ids.locationC],
    );
    await expect(
      client.query(
        `SELECT * FROM staff_management_set_role($1,$2,$3,2,'VALET_SUPERVISOR')`,
        [ids.lmMembership, ids.organization, ids.employeeMembership],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await client.query(
      `DELETE FROM membership_location_access
       WHERE membership_id=$1 AND location_id=$2`,
      [ids.employeeMembership, ids.locationC],
    );
  });

  it("enforces actor-active Locations and a non-empty covered result with one CAS version", async () => {
    await expect(
      client.query(
        `SELECT * FROM staff_management_set_location_access(
           $1,$2,$3,2,ARRAY[$4]::uuid[],TRUE)`,
        [
          ids.lmMembership,
          ids.organization,
          ids.employeeMembership,
          ids.locationC,
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const grant = await client.query(
      `SELECT * FROM staff_management_set_location_access(
         $1,$2,$3,2,ARRAY[$4]::uuid[],TRUE)`,
      [
        ids.lmMembership,
        ids.organization,
        ids.employeeMembership,
        ids.locationB,
      ],
    );
    expect(grant.rows[0]).toMatchObject({
      affected_count: 1,
      changed: true,
      version: 3,
    });
    await expect(
      client.query(
        `SELECT * FROM staff_management_set_location_access(
           $1,$2,$3,3,ARRAY[$4,$5]::uuid[],FALSE)`,
        [
          ids.lmMembership,
          ids.organization,
          ids.employeeMembership,
          ids.locationA,
          ids.locationB,
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const revoke = await client.query(
      `SELECT * FROM staff_management_set_location_access(
         $1,$2,$3,3,ARRAY[$4]::uuid[],FALSE)`,
      [
        ids.lmMembership,
        ids.organization,
        ids.employeeMembership,
        ids.locationB,
      ],
    );
    expect(revoke.rows[0]).toMatchObject({
      affected_count: 1,
      changed: true,
      version: 4,
    });
  });
});
