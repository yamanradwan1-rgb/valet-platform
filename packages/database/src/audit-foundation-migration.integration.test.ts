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
const auditFoundationMigration = "20260916003500_mgt_be_01_audit_foundation";
const suffix = randomUUID().replaceAll("-", "");
const freshDatabaseName = `valet_audit_foundation_fresh_${suffix}`;
const upgradeDatabaseName = `valet_audit_foundation_upgrade_${suffix}`;
const clients: Client[] = [];

interface HistoricalAuditRow {
  actor_membership_id: string | null;
  created_at: Date;
  entity_id: string;
  entity_type: string;
  event_type: string;
  id: string;
  location_id: string | null;
  metadata_json: Record<string, unknown>;
  occurred_at: Date;
  organization_id: string;
  valet_session_id: string | null;
}

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

async function accountAuditTableExists(client: Client): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT to_regclass('public.account_security_audit_events') IS NOT NULL
       AS present`,
  );
  return result.rows[0]!.present;
}

let freshClient: Client;
let upgradeClient: Client;
let legacyBefore: HistoricalAuditRow;
let actorTypeExistedBefore = true;
let operatorRefExistedBefore = true;
const legacyAuditId = randomUUID();
const organizationId = randomUUID();
const locationId = randomUUID();
const userId = randomUUID();
const membershipId = randomUUID();
const vehicleId = randomUUID();
const sessionId = randomUUID();
const occurredAt = new Date("2026-09-15T20:15:30.123Z");
const createdAt = new Date("2026-09-15T20:15:31.456Z");

beforeAll(async () => {
  freshClient = await createDatabase(freshDatabaseName);
  for (const migration of expectedMigrationDirectories) {
    await applyMigration(freshClient, migration);
  }

  upgradeClient = await createDatabase(upgradeDatabaseName);
  for (const migration of expectedMigrationDirectories.slice(
    0,
    expectedMigrationDirectories.indexOf(auditFoundationMigration),
  )) {
    await applyMigration(upgradeClient, migration);
  }

  const legacyColumns = await upgradeClient.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_events'
       AND column_name IN ('actor_type', 'controlled_operator_ref')`,
  );
  actorTypeExistedBefore = legacyColumns.rows.some(
    (row) => row.column_name === "actor_type",
  );
  operatorRefExistedBefore = legacyColumns.rows.some(
    (row) => row.column_name === "controlled_operator_ref",
  );

  await upgradeClient.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'Legacy audit tenant', 'Asia/Amman', transaction_timestamp())`,
    [organizationId],
  );
  await upgradeClient.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Legacy audit location', 'LEGACY-AUDIT', 'Address',
             'Asia/Amman', 'JOD', 'ACTIVE', transaction_timestamp())`,
    [locationId, organizationId],
  );
  await upgradeClient.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
    [userId, `${userId}@audit-migration.test`],
  );
  await upgradeClient.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  await upgradeClient.query(
    `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, 'Legacy audit vehicle', transaction_timestamp())`,
    [vehicleId, organizationId],
  );
  await upgradeClient.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 hour', $3, $4, $5,
             'CHECKING_IN', $6, transaction_timestamp())`,
    [
      sessionId,
      `audit-migration:${randomUUID()}`,
      organizationId,
      locationId,
      vehicleId,
      membershipId,
    ],
  );
  await upgradeClient.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at, created_at)
     VALUES ($1, $2, $3, $4, NULL, 'LEGACY_NULL_ACTOR_EVENT',
             'ValetSession', $4, $5::jsonb, $6, $7)`,
    [
      legacyAuditId,
      organizationId,
      locationId,
      sessionId,
      JSON.stringify({ source: "pre-mgt-be-01", meaning: "unchanged" }),
      occurredAt,
      createdAt,
    ],
  );
  const before = await upgradeClient.query<HistoricalAuditRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, actor_membership_id::text, event_type,
            entity_type, entity_id::text, metadata_json, occurred_at, created_at
     FROM audit_events WHERE id = $1`,
    [legacyAuditId],
  );
  legacyBefore = before.rows[0]!;

  await applyMigration(upgradeClient, auditFoundationMigration);
}, 120_000);

afterAll(async () => {
  for (const client of clients) await client.end();
  const bootstrap = new Client({ connectionString: baseDatabaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${freshDatabaseName}" WITH (FORCE)`);
    await bootstrap.query(
      `DROP DATABASE "${upgradeDatabaseName}" WITH (FORCE)`,
    );
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("MGT-BE-01 audit foundation migration 35", () => {
  it("applies the current history including audit foundation from an empty database", async () => {
    expect(expectedMigrationDirectories).toHaveLength(42);
    expect(expectedMigrationDirectories.at(34)).toBe(auditFoundationMigration);
    expect(await accountAuditTableExists(freshClient)).toBe(true);
  });

  it("upgrades legacy null-actor audit history without changing its meaning", async () => {
    expect(actorTypeExistedBefore).toBe(false);
    expect(operatorRefExistedBefore).toBe(false);

    const result = await upgradeClient.query<
      HistoricalAuditRow & {
        actor_type: string | null;
        operator_ref: string | null;
      }
    >(
      `SELECT id::text, organization_id::text, location_id::text,
              valet_session_id::text, actor_membership_id::text, event_type,
              entity_type, entity_id::text, metadata_json, occurred_at, created_at,
              actor_type::text, controlled_operator_ref AS operator_ref
       FROM audit_events WHERE id = $1`,
      [legacyAuditId],
    );
    const after = result.rows[0]!;

    expect(after).toMatchObject({
      ...legacyBefore,
      actor_type: null,
      operator_ref: null,
    });
    expect(after.occurred_at).toEqual(legacyBefore.occurred_at);
    expect(after.created_at).toEqual(legacyBefore.created_at);

    const locations = await upgradeClient.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM locations WHERE organization_id = $1`,
      [organizationId],
    );
    expect(locations.rows[0]!.count).toBe("1");
    expect(after.location_id).toBe(locationId);
    expect(await accountAuditTableExists(upgradeClient)).toBe(true);
  });
});
