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
const databaseName = `valet_009f_migration_${randomUUID().replaceAll("-", "")}`;
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
     VALUES ($1, 'Branding tenant', 'Asia/Amman', transaction_timestamp())`,
    [organizationId],
  );
  await client.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Original name', $3, 'Address', 'Asia/Amman', 'JOD',
             'ACTIVE', transaction_timestamp())`,
    [locationId, organizationId, randomUUID()],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
             transaction_timestamp())`,
    [userId, `${userId}@branding.test`],
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

describe("migration 30 basic branding and subscription entitlements", () => {
  it("is exactly migration 30 with the manifest in order", async () => {
    const directories = (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual([...expectedMigrationDirectories]);
    expect(directories).toHaveLength(36);
    expect(directories[29]).toBe(
      "20260822003000_phase7_basic_branding_subscription_entitlements",
    );
    expect(directories.at(-1)).toBe("20260916003600_mgt_be_02_complete_mfa");
  });

  it("backfills brand primary color and enforces persisted shapes", async () => {
    const defaults = await client.query<{ color: string }>(
      `SELECT brand_primary_color AS color FROM organizations WHERE id = $1`,
      [organizationId],
    );
    expect(defaults.rows[0]!.color).toBe("#176BFF");
    await expect(
      client.query(
        `UPDATE organizations SET brand_primary_color = '#00bfff'
         WHERE id = $1`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      client.query(
        `UPDATE locations SET brand_display_name_override = ''
         WHERE id = $1`,
        [locationId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      client.query(
        `UPDATE locations SET brand_primary_color_override = '#abc123'
         WHERE id = $1`,
        [locationId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces subscription shape constraints at the database level", async () => {
    const seedPlanCode = async (code: string) => {
      const org = randomUUID();
      await client.query(
        `INSERT INTO organizations (id, name, timezone, updated_at)
         VALUES ($1, $2, 'Asia/Amman', transaction_timestamp())`,
        [org, "Sub " + code],
      );
      await client.query(
        `INSERT INTO organization_subscriptions
           (organization_id, plan_code, status, dashboard_access_enabled,
            report_exports_enabled, basic_branding_enabled)
         VALUES ($1, $2, 'ACTIVE', TRUE, TRUE, FALSE)`,
        [org, code],
      );
      return org;
    };
    const valid = await seedPlanCode("PILOT_STANDARD_2026");
    const count = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM organization_subscriptions`,
    );
    void valid;
    expect(Number(count.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    await expect(seedPlanCode("lowercase")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(seedPlanCode("")).rejects.toBeTruthy();
    await expect(seedPlanCode("A".repeat(65))).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      client.query(
        `UPDATE organization_subscriptions SET status = 'CANCELLED'`,
      ),
    ).rejects.toMatchObject({ code: "22P02" });
  });

  it("keeps one row per Organization through the restrictive PK", async () => {
    await expect(
      client.query(
        `INSERT INTO organization_subscriptions
           (organization_id, plan_code, status, dashboard_access_enabled,
            report_exports_enabled, basic_branding_enabled)
         SELECT organization_id, 'OTHER', 'TRIAL', FALSE, FALSE, FALSE
         FROM organization_subscriptions LIMIT 1`,
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("mutates branding overrides only via SECURITY DEFINER functions", async () => {
    const current = await client.query<{ u: Date }>(
      `SELECT updated_at AS u FROM locations WHERE id = $1`,
      [locationId],
    );
    const token = await client.query<{ t: Date }>(
      `SELECT location_branding_set_display_name_override(
          $1, $2, '  فندق النخبة  ', $3) AS t`,
      [membershipId, locationId, current.rows[0]!.u],
    );
    expect(token.rows[0]!.t > current.rows[0]!.u).toBe(true);
    const state = await client.query<{
      effective_value: string;
      override_present: boolean;
    }>(`SELECT * FROM location_branding_setting_state($1,'brandDisplayName')`, [
      locationId,
    ]);
    expect(state.rows[0]).toEqual({
      effective_value: "فندق النخبة",
      override_present: true,
      override_value: "فندق النخبة",
    });
    const stale = await client
      .query<{ t: Date }>(
        `SELECT location_branding_clear_display_name_override($1,$2,$3) AS t`,
        [
          membershipId,
          locationId,
          new Date(current.rows[0]!.u.getTime() - 1000),
        ],
      )
      .catch((e) => e.code);
    expect(stale).toBe("40001");

    const auditsBefore = (
      await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_events
         WHERE event_type='DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'`,
      )
    ).rows[0]!.n;
    await expect(
      client.query(
        `SELECT location_branding_set_primary_color_override(
            $1, $2, '#00bfff', transaction_timestamp())`,
        [membershipId, locationId],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      client.query(
        `SELECT location_branding_set_display_name_override($1, $2, $3,
            transaction_timestamp())`,
        [membershipId, locationId, "x".repeat(121)],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    const auditsAfterInvalid = (
      await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_events
         WHERE event_type='DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'`,
      )
    ).rows[0]!.n;
    expect(auditsAfterInvalid).toBe(auditsBefore);
    const cleared = await client.query<{ t: Date }>(
      `SELECT location_branding_clear_display_name_override($1,$2,$3) AS t`,
      [membershipId, locationId, token.rows[0]!.t],
    );
    expect(cleared.rows[0]!.t > token.rows[0]!.t).toBe(true);
    const meta = await client.query<{ actor_type: string; m: unknown }>(
      `SELECT actor_type::text, metadata_json AS m FROM audit_events
       WHERE event_type='DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'
       ORDER BY occurred_at DESC LIMIT 1`,
    );
    expect(meta.rows[0]!.actor_type).toBe("MEMBERSHIP");
    expect(meta.rows[0]!.m).toMatchObject({
      newOverridePresent: false,
      oldOverridePresent: true,
      operation: "CLEAR",
      scope: "LOCATION_BRANDING_OVERRIDE",
      settingKey: "brandDisplayName",
    });
  });
});
