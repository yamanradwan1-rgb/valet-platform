import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const suffix = randomUUID().replaceAll("-", "");
const emptyDatabaseName = `valet_push_empty_${suffix}`;
const upgradeDatabaseName = `valet_push_upgrade_${suffix}`;
const clients: Client[] = [];

function databaseUrl(name: string): string {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function createDatabase(name: string): Promise<Client> {
  const bootstrap = new Client({ connectionString: baseDatabaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${name}"`);
  } finally {
    await bootstrap.end();
  }
  const client = new Client({ connectionString: databaseUrl(name) });
  await client.connect();
  clients.push(client);
  return client;
}

async function applyMigration(client: Client, name: string): Promise<void> {
  const sql = await readFile(
    new URL(`${name}/migration.sql`, migrationRoot),
    "utf8",
  );
  await client.query(sql);
}

async function tableNames(client: Client): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'staff_push_%'
     ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

let emptyClient: Client;
let upgradeClient: Client;
const representativeOrganizationId = randomUUID();
const staffPushMigration = "20260910003200_mob_020a_staff_push_persistence";
const staffPushCleanupMigration = "20260911003300_mob_020d_staff_push_cleanup";

beforeAll(async () => {
  emptyClient = await createDatabase(emptyDatabaseName);
  for (const migration of expectedMigrationDirectories) {
    await applyMigration(emptyClient, migration);
  }

  upgradeClient = await createDatabase(upgradeDatabaseName);
  const staffPushIndex =
    expectedMigrationDirectories.indexOf(staffPushMigration);
  for (const migration of expectedMigrationDirectories.slice(
    0,
    staffPushIndex,
  )) {
    await applyMigration(upgradeClient, migration);
  }
  await upgradeClient.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'Representative tenant', 'Asia/Amman', transaction_timestamp())`,
    [representativeOrganizationId],
  );
  await upgradeClient.query(
    `INSERT INTO notifications
       (id, organization_id, channel, recipient, template_key)
     VALUES ($1, $2, 'SMS', '+000000000', 'representative-existing-row')`,
    [randomUUID(), representativeOrganizationId],
  );
  await applyMigration(upgradeClient, staffPushMigration);
  await applyMigration(upgradeClient, staffPushCleanupMigration);
}, 120_000);

afterAll(async () => {
  for (const client of clients) {
    await client.end();
  }
  const bootstrap = new Client({ connectionString: baseDatabaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${emptyDatabaseName}" WITH (FORCE)`);
    await bootstrap.query(
      `DROP DATABASE "${upgradeDatabaseName}" WITH (FORCE)`,
    );
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("MOB-020A/020D Staff Push migrations 32 and 33", () => {
  it("applies from an empty database through the full ordered history", async () => {
    expect(expectedMigrationDirectories).toHaveLength(46);
    expect(expectedMigrationDirectories).toContain(staffPushMigration);
    expect(expectedMigrationDirectories.at(32)).toBe(staffPushCleanupMigration);
    expect(await tableNames(emptyClient)).toEqual([
      "staff_push_deliveries",
      "staff_push_intents",
      "staff_push_registrations",
    ]);
  });

  it("applies on the representative pre-MOB-020A schema without data loss", async () => {
    expect(await tableNames(upgradeClient)).toEqual([
      "staff_push_deliveries",
      "staff_push_intents",
      "staff_push_registrations",
    ]);
    const result = await upgradeClient.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications
       WHERE organization_id = $1 AND template_key = 'representative-existing-row'`,
      [representativeOrganizationId],
    );
    expect(result.rows[0]!.count).toBe("1");
  });

  it.each(["empty", "upgrade"] as const)(
    "installs the narrow cleanup boundary on the %s path",
    async (path) => {
      const client = path === "empty" ? emptyClient : upgradeClient;
      const result = await client.query<{
        public_denied: boolean;
        security_definer: boolean;
        safe_search_path: boolean;
      }>(
        `SELECT function.prosecdef AS security_definer,
                function.proconfig =
                  ARRAY['search_path=pg_catalog, public']::text[] AS safe_search_path,
                NOT EXISTS (
                  SELECT 1 FROM aclexplode(
                    COALESCE(function.proacl,
                             acldefault('f', function.proowner))
                  ) AS privilege
                  WHERE privilege.grantee = 0
                    AND privilege.privilege_type = 'EXECUTE'
                ) AS public_denied
         FROM pg_proc AS function
         WHERE function.oid = 'public.cleanup_staff_push_v1()'::regprocedure`,
      );
      expect(result.rows[0]).toEqual({
        public_denied: true,
        safe_search_path: true,
        security_definer: true,
      });
      const staleIndex = await client.query<{ present: boolean }>(
        `SELECT to_regclass(
          'public.staff_push_registrations_stale_active_idx'
        ) IS NOT NULL AS present`,
      );
      expect(staleIndex.rows[0]!.present).toBe(true);
    },
  );
});
