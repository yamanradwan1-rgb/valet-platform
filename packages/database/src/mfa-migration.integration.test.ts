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
const migration = "20260916003600_mgt_be_02_complete_mfa";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const mfaMigrations = expectedMigrationDirectories.slice(0, migrationIndex + 1);
const suffix = randomUUID().replaceAll("-", "");
const freshName = `valet_mfa_fresh_${suffix}`;
const upgradeName = `valet_mfa_upgrade_${suffix}`;
const clients: Client[] = [];
let fresh: Client;
let upgrade: Client;
const existingUserId = randomUUID();
const existingSessionId = randomUUID();

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
  for (const name of mfaMigrations) await apply(fresh, name);

  upgrade = await createDatabase(upgradeName);
  for (const name of mfaMigrations.slice(0, -1)) {
    await apply(upgrade, name);
  }
  await upgrade.query(
    `INSERT INTO users (id,email,password_hash,updated_at)
     VALUES ($1,$2,'test-hash',transaction_timestamp())`,
    [existingUserId, `${existingUserId}@mfa-upgrade.test`],
  );
  await upgrade.query(
    `INSERT INTO staff_auth_sessions
       (id,user_id,current_access_token_hash,access_expires_at,
        absolute_expires_at,created_at,last_rotated_at)
     VALUES ($1,$2,$3,
             TIMESTAMPTZ '2026-09-16 01:15:00+00',
             TIMESTAMPTZ '2026-10-16 01:00:00+00',
             TIMESTAMPTZ '2026-09-16 01:00:00+00',
             TIMESTAMPTZ '2026-09-16 01:00:00+00')`,
    [
      existingSessionId,
      existingUserId,
      `staff-access-sha256:v1:${"a".repeat(64)}`,
    ],
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

describe("MGT-BE-02 complete MFA migration 36", () => {
  it("applies the complete 36-migration history from an empty database", async () => {
    expect(mfaMigrations).toHaveLength(36);
    expect(mfaMigrations.at(-1)).toBe(migration);
    const tables = await fresh.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN ('user_mfa_totp_factors','mfa_recovery_codes')
       ORDER BY table_name`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "mfa_recovery_codes",
      "user_mfa_totp_factors",
    ]);
  });

  it("upgrades existing Staff sessions with no fabricated MFA assurance", async () => {
    const row = await upgrade.query<{
      last_admin_activity_at: Date | null;
      mfa_authenticated_at: Date | null;
      mfa_factor_id: string | null;
    }>(
      `SELECT mfa_authenticated_at,mfa_factor_id,last_admin_activity_at
       FROM staff_auth_sessions WHERE id=$1`,
      [existingSessionId],
    );
    expect(row.rows[0]).toEqual({
      last_admin_activity_at: null,
      mfa_authenticated_at: null,
      mfa_factor_id: null,
    });
    const factors = await upgrade.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM user_mfa_totp_factors`,
    );
    const codes = await upgrade.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM mfa_recovery_codes`,
    );
    expect(factors.rows[0]?.count).toBe("0");
    expect(codes.rows[0]?.count).toBe("0");
  });

  it.each(["fresh", "upgrade"] as const)(
    "installs exact MFA enum and anti-abuse scopes on %s path",
    async (path) => {
      const client = path === "fresh" ? fresh : upgrade;
      const values = await client.query<{ enumlabel: string }>(
        `SELECT enumlabel FROM pg_enum
         WHERE enumtypid='mfa_totp_factor_state'::regtype ORDER BY enumsortorder`,
      );
      expect(values.rows.map((row) => row.enumlabel)).toEqual([
        "PENDING",
        "ACTIVE",
        "RETIRED",
      ]);
      for (const scope of ["v1:mfa-totp-user", "v1:mfa-recovery-user"]) {
        await expect(
          client.query(
            `INSERT INTO anti_abuse_events(scope,key_hash,state)
             VALUES ($1,$2,'IGNORED')`,
            [scope, `anti-abuse-hmac-sha256:v1:${"b".repeat(64)}`],
          ),
        ).resolves.toMatchObject({ rowCount: 1 });
      }
    },
  );
});
