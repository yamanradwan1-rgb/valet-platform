import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "migrations",
);
const databaseName = `valet_location_config_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.pathname = `/${databaseName}`;

let client: Client;
const organizationId = randomUUID();
const locationId = randomUUID();
const membershipId = randomUUID();

async function applyMigration(name: string): Promise<void> {
  await client.query(
    await readFile(join(migrationRoot, name, "migration.sql"), "utf8"),
  );
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: baseDatabaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    await applyMigration(migration);
  }
  const userId = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'Config tenant', 'Asia/Amman', transaction_timestamp())`,
    [organizationId],
  );
  await client.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Config location', $3, 'Address', 'Asia/Amman', 'JOD',
             'ACTIVE', transaction_timestamp())`,
    [locationId, organizationId, randomUUID()],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
             transaction_timestamp())`,
    [userId, `${userId}@config-migration.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, 'LOCATION_MANAGER', 'ACTIVE',
             transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  await client.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
    [organizationId, membershipId, locationId],
  );
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: baseDatabaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

const mutationFunctions = [
  "public.location_configuration_set_override(uuid,uuid,text,text,timestamp with time zone)",
  "public.location_configuration_clear_override(uuid,uuid,text,timestamp with time zone)",
];
const helperFunctions = [
  "public.location_configuration_authorized_organization(uuid,uuid)",
  "public.location_configuration_setting_state(uuid,text)",
  "public.location_configuration_append_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
];

describe("migration 29 location configuration authority", () => {
  it("is exactly migration 29 with the manifest in order", async () => {
    const directories = (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual([...expectedMigrationDirectories]);
    expect(directories).toHaveLength(34);
    expect(directories.at(-5)).toBe(
      "20260822003000_phase7_basic_branding_subscription_entitlements",
    );
    expect(directories.at(-1)).toBe(
      "20260912003400_mob_023b_incident_recovery_intents",
    );
  });

  it("installs safe SECURITY DEFINER functions owned by the migration role", async () => {
    for (const functionName of [...mutationFunctions, ...helperFunctions]) {
      const result = await client.query<{
        found: boolean;
        public_denied: boolean;
        prosecdef: boolean;
        search_path_safe: boolean;
      }>(
        `SELECT function.prosecdef AS prosecdef,
                function.proconfig =
                  ARRAY['search_path=pg_catalog, public']::text[]
                  AS search_path_safe,
                NOT EXISTS (
                  SELECT 1 FROM pg_proc AS candidate
                  CROSS JOIN LATERAL aclexplode(
                    COALESCE(candidate.proacl,
                             acldefault('f', candidate.proowner))
                  ) AS privilege
                  WHERE candidate.oid = to_regprocedure($1)
                    AND privilege.grantee = 0
                    AND privilege.privilege_type = 'EXECUTE'
                ) AS public_denied,
                to_regprocedure($1) IS NOT NULL AS found
         FROM (SELECT to_regprocedure($1) AS oid) AS target
         LEFT JOIN pg_proc AS function ON function.oid = target.oid`,
        [functionName],
      );
      expect(result.rows[0]).toMatchObject({
        found: true,
        public_denied: true,
        prosecdef: true,
        search_path_safe: true,
      });
    }
  });

  it("sets one override, advances the token and audits exactly once", async () => {
    const before = await client.query<{ updated_at: Date; audit: string }>(
      `SELECT updated_at,
              (SELECT count(*)::text FROM audit_events
               WHERE entity_type = 'Location') AS audit
       FROM locations WHERE id = $1`,
      [locationId],
    );
    const token = await client.query<{ token: Date }>(
      `SELECT location_configuration_set_override(
          $1, $2, 'valetServiceFee', '2.5', $3) AS token`,
      [membershipId, locationId, before.rows[0]!.updated_at],
    );
    expect(token.rows[0]!.token > before.rows[0]!.updated_at).toBe(true);
    const state = await client.query<{
      effective_value: string;
      override_present: boolean;
      override_value: string | null;
    }>(
      `SELECT * FROM location_configuration_setting_state(
          $1, 'valetServiceFee')`,
      [locationId],
    );
    expect(state.rows[0]).toEqual({
      effective_value: "2.500",
      override_present: true,
      override_value: "2.500",
    });
    const audits = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events WHERE entity_type='Location'`,
    );
    expect(Number(audits.rows[0]!.n)).toBe(Number(before.rows[0]!.audit) + 1);
  });

  it("denies wrong roles, stale tokens and invalid values without mutation or audit", async () => {
    const current = await client.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id = $1`,
      [locationId],
    );
    const strangerMembership = randomUUID();
    const strangerUser = randomUUID();
    await client.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'x', 'ACTIVE', transaction_timestamp())`,
      [strangerUser, `${strangerUser}@config-migration.test`],
    );
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'VALET_SUPERVISOR', 'ACTIVE',
               transaction_timestamp())`,
      [strangerMembership, organizationId, strangerUser],
    );
    const auditsBefore = (
      await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_events
         WHERE entity_type = 'Location'`,
      )
    ).rows[0]!.n;
    await expect(
      client.query(
        `SELECT location_configuration_set_override(
            $1, $2, 'tipsEnabled', 'true', $3)`,
        [strangerMembership, locationId, current.rows[0]!.updated_at],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      client.query(
        `SELECT location_configuration_set_override(
            $1, $2, 'tipsEnabled', 'true', $3)`,
        [
          membershipId,
          locationId,
          new Date(current.rows[0]!.updated_at.getTime() - 1000),
        ],
      ),
    ).rejects.toMatchObject({ code: "40001" });
    for (const [key, value] of [
      ["rawGpsRetentionDays", "0"],
      ["valetServiceFee", "-3"],
      ["operatingHours", "x"],
    ] as const) {
      await expect(
        client.query(
          `SELECT location_configuration_set_override($1, $2, $3, $4, $5)`,
          [membershipId, locationId, key, value, current.rows[0]!.updated_at],
        ),
      ).rejects.toMatchObject({ code: "22023" });
    }
    const auditsAfter = (
      await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_events
         WHERE entity_type = 'Location'`,
      )
    ).rows[0]!.n;
    expect(auditsAfter).toBe(auditsBefore);
  });

  it("clears an override back to inheritance with one atomic audit", async () => {
    const current = await client.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id = $1`,
      [locationId],
    );
    const cleared = await client.query<{ token: Date }>(
      `SELECT location_configuration_clear_override($1, $2, $3, $4) AS token`,
      [
        membershipId,
        locationId,
        "valetServiceFee",
        current.rows[0]!.updated_at,
      ],
    );
    expect(cleared.rows[0]!.token > current.rows[0]!.updated_at).toBe(true);
    const state = await client.query<{
      effective_value: string;
      override_present: boolean;
      override_value: string | null;
    }>(
      `SELECT * FROM location_configuration_setting_state(
          $1, 'valetServiceFee')`,
      [locationId],
    );
    expect(state.rows[0]).toEqual({
      effective_value: "0.000",
      override_present: false,
      override_value: null,
    });
    const metadata = await client.query<{ metadata_json: unknown }>(
      `SELECT metadata_json FROM audit_events
       WHERE entity_type = 'Location'
         AND event_type = 'LOCATION_CONFIGURATION_OVERRIDE_CLEAR'
       LIMIT 1`,
    );
    expect(metadata.rows[0]!.metadata_json).toMatchObject({
      newOverridePresent: false,
      oldOverridePresent: true,
      operation: "CLEAR",
      scope: "LOCATION_OVERRIDE",
      settingKey: "valetServiceFee",
    });
  });
});
