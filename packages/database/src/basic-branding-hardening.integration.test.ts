import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
const databaseName = `valet_009f_hardening_${randomUUID().replaceAll("-", "")}`;
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
     VALUES ($1, 'Hardening tenant', 'Asia/Amman', transaction_timestamp())`,
    [organizationId],
  );
  await client.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Hardening location', $3, 'Address', 'Asia/Amman',
             'JOD', 'ACTIVE', transaction_timestamp())`,
    [locationId, organizationId, randomUUID()],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'x', 'ACTIVE', transaction_timestamp())`,
    [userId, `${userId}@hardening.test`],
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

async function brandingAuditCount(): Promise<number> {
  const result = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_events
     WHERE event_type = 'DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'`,
  );
  return Number(result.rows[0]!.n);
}


describe("migration 31 branding hardening", () => {
  it("rejects NULL through the primary-color SET function with no mutation or audit", async () => {
    const before = await client.query<{ token: Date; value: string | null }>(
      `SELECT updated_at AS token,
              brand_primary_color_override::text AS value
       FROM locations WHERE id = $1`,
      [locationId],
    );
    const auditsBefore = await brandingAuditCount();
    await expect(
      client.query(
        `SELECT location_branding_set_primary_color_override($1,$2,NULL,$3)`,
        [membershipId, locationId, before.rows[0]!.token],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    const after = await client.query<{ token: Date; value: string | null }>(
      `SELECT updated_at AS token,
              brand_primary_color_override::text AS value
       FROM locations WHERE id = $1`,
      [locationId],
    );
    expect(after.rows[0]).toEqual({
      token: before.rows[0]!.token,
      value: before.rows[0]!.value,
    });
    expect(await brandingAuditCount()).toBe(auditsBefore);
  });

  it("rejects direct persistence of non-canonical display-name overrides", async () => {
    await expect(
      client.query(
        `INSERT INTO locations (id, organization_id, name, code,
            address_text, timezone, currency, status,
            brand_display_name_override, updated_at)
         VALUES ($1, $2, 'X', $3, 'A', 'Asia/Amman', 'JOD', 'ACTIVE',
                 '  Hotel Name  ', transaction_timestamp())`,
        [randomUUID(), organizationId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    // Canonical Arabic value accepted under admin/migration authority.
    const canonicalId = randomUUID();
    await client.query(
      `INSERT INTO locations (id, organization_id, name, code,
          address_text, timezone, currency, status,
          brand_display_name_override, updated_at)
       VALUES ($1, $2, 'Y', $3, 'A', 'Asia/Amman', 'JOD', 'ACTIVE',
               'فندق النخبة', transaction_timestamp())`,
      [canonicalId, organizationId, randomUUID()],
    );
    const stored = await client.query<{ v: string }>(
      `SELECT brand_display_name_override::text AS v FROM locations
       WHERE id = $1`,
      [canonicalId],
    );
    expect(stored.rows[0]!.v).toBe("فندق النخبة");
  });

  it("trims user input through the SECURITY DEFINER SET function", async () => {
    const current = await client.query<{ u: Date }>(
      `SELECT updated_at AS u FROM locations WHERE id = $1`,
      [locationId],
    );
    await client.query(
      `SELECT location_branding_set_display_name_override($1,$2,$3,$4)`,
      [membershipId, locationId, "  فندق النخبة  ", current.rows[0]!.u],
    );
    const stored = await client.query<{ v: string | null }>(
      `SELECT brand_display_name_override::text AS v FROM locations
       WHERE id = $1`,
      [locationId],
    );
    expect(stored.rows[0]!.v).toBe("فندق النخبة");
  });

  it("keeps whitespace-only, over-length and control values rejected", async () => {
    for (const bad of ["   ", "\t\n", "x".repeat(121), "a\u0001b"]) {
      const current = await client.query<{ u: Date }>(
        `SELECT updated_at AS u FROM locations WHERE id = $1`,
        [locationId],
      );
      await expect(
        client.query(
          `SELECT location_branding_set_display_name_override($1,$2,$3,$4)`,
          [membershipId, locationId, bad, current.rows[0]!.u],
        ),
      ).rejects.toMatchObject({ code: "22023" });
    }
  });

  it("preserves primary-color lowercase rejection after hardening", async () => {
    const current = await client.query<{ u: Date }>(
      `SELECT updated_at AS u FROM locations WHERE id = $1`,
      [locationId],
    );
    await expect(
      client.query(
        `SELECT location_branding_set_primary_color_override(
            $1,$2,'#123abc',$3)`,
        [membershipId, locationId, current.rows[0]!.u],
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });
});
