import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

interface PostgresError extends Error {
  readonly code?: string;
  readonly constraint?: string;
}

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
const databaseName = `valet_financial_policy_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.pathname = `/${databaseName}`;

let databaseClient: Client;
let migrationDirectories: string[] = [];
let organizationId: string;
let locationId: string;

async function applyMigration(name: string): Promise<void> {
  const sql = await readFile(
    join(migrationRoot, name, "migration.sql"),
    "utf8",
  );
  await databaseClient.query(sql);
}

async function expectCheckFailure(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected ${constraint} to reject the operation.`);
  } catch (error) {
    const postgresError = error as PostgresError;
    expect(postgresError.code).toBe("23514");
    expect(postgresError.constraint).toBe(constraint);
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: baseDatabaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  databaseClient = new Client({ connectionString: databaseUrl.toString() });
  await databaseClient.connect();
  migrationDirectories = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrationDirectories.slice(0, 25)) {
    await applyMigration(migration);
  }
  organizationId = randomUUID();
  locationId = randomUUID();
  await databaseClient.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'Existing financial tenant', 'Asia/Amman',
             transaction_timestamp())`,
    [organizationId],
  );
  await databaseClient.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        updated_at)
     VALUES ($1, $2, 'Existing location', 'EXISTING', 'Address',
             'Asia/Amman', 'JOD', transaction_timestamp())`,
    [locationId, organizationId],
  );
  await applyMigration(migrationDirectories[25]!);
}, 120_000);

afterAll(async () => {
  await databaseClient?.end();
  const bootstrap = new Client({ connectionString: baseDatabaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("migration 26 financial policy", () => {
  it("is exactly the next forward-only migration with exact enum values", async () => {
    expect(migrationDirectories).toEqual([...expectedMigrationDirectories]);
    expect(migrationDirectories).toHaveLength(29);
    expect(migrationDirectories[25]).toBe(
      "20260815002600_phase6_financial_policy_payment_core",
    );
    const values = await databaseClient.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'payment_methods_policy'::regtype
       ORDER BY enumsortorder`,
    );
    expect(values.rows.map((row) => row.enumlabel)).toEqual([
      "CASH_ONLY",
      "DIGITAL_ONLY",
      "CASH_OR_DIGITAL",
    ]);
  });

  it("backfills safe Organization defaults and nullable Location inheritance", async () => {
    const organization = await databaseClient.query(
      `SELECT valet_service_fee::text, payment_service_payer::text,
              payment_methods_policy::text, tips_enabled,
              validation_enabled, release_requires_payment
       FROM organizations WHERE id = $1`,
      [organizationId],
    );
    expect(organization.rows[0]).toEqual({
      payment_methods_policy: "CASH_ONLY",
      payment_service_payer: "CUSTOMER",
      release_requires_payment: false,
      tips_enabled: false,
      validation_enabled: false,
      valet_service_fee: "0.000",
    });
    const location = await databaseClient.query(
      `SELECT valet_service_fee_override::text,
              payment_service_payer_override::text,
              payment_methods_policy_override::text,
              tips_enabled_override, validation_enabled_override,
              release_requires_payment_override
       FROM locations WHERE id = $1`,
      [locationId],
    );
    expect(location.rows[0]).toEqual({
      payment_methods_policy_override: null,
      payment_service_payer_override: null,
      release_requires_payment_override: null,
      tips_enabled_override: null,
      validation_enabled_override: null,
      valet_service_fee_override: null,
    });
  });

  it("uses exact defaults for newly inserted Organizations", async () => {
    const id = randomUUID();
    await databaseClient.query(
      `INSERT INTO organizations (id, name, timezone, updated_at)
       VALUES ($1, 'New financial tenant', 'Asia/Amman',
               transaction_timestamp())`,
      [id],
    );
    const result = await databaseClient.query(
      `SELECT valet_service_fee::text, payment_service_payer::text,
              payment_methods_policy::text, tips_enabled,
              validation_enabled, release_requires_payment
       FROM organizations WHERE id = $1`,
      [id],
    );
    expect(result.rows[0]).toEqual({
      payment_methods_policy: "CASH_ONLY",
      payment_service_payer: "CUSTOMER",
      release_requires_payment: false,
      tips_enabled: false,
      validation_enabled: false,
      valet_service_fee: "0.000",
    });
  });

  it("rejects negative Organization fees and Location overrides", async () => {
    await expectCheckFailure(
      databaseClient.query(
        `UPDATE organizations SET valet_service_fee = -0.001 WHERE id = $1`,
        [organizationId],
      ),
      "organizations_valet_service_fee_check",
    );
    await expectCheckFailure(
      databaseClient.query(
        `UPDATE locations SET valet_service_fee_override = -0.001
         WHERE id = $1`,
        [locationId],
      ),
      "locations_valet_service_fee_override_check",
    );
    await expect(
      databaseClient.query(
        `UPDATE locations SET valet_service_fee_override = NULL WHERE id = $1`,
        [locationId],
      ),
    ).resolves.toBeDefined();
  });
});
