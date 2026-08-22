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
const databaseName = `valet_cash_reconciliation_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.pathname = `/${databaseName}`;

let client: Client;
let organizationId: string;
let locationId: string;
let membershipId: string;
let activeShiftId: string;
let endedShiftId: string;

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
  for (const migration of expectedMigrationDirectories.slice(0, 26)) {
    await applyMigration(migration);
  }
  organizationId = randomUUID();
  locationId = randomUUID();
  membershipId = randomUUID();
  activeShiftId = randomUUID();
  endedShiftId = randomUUID();
  const userId = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'Cash migration tenant', 'Asia/Amman', transaction_timestamp())`,
    [organizationId],
  );
  await client.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        updated_at)
     VALUES ($1, $2, 'Cash migration location', 'CASH', 'Address',
             'Asia/Amman', 'JOD', transaction_timestamp())`,
    [locationId, organizationId],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', transaction_timestamp())`,
    [userId, `${randomUUID()}@cash-migration.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  await client.query(
    `INSERT INTO shifts
       (id, organization_id, location_id, membership_id, status, started_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE',
             transaction_timestamp() - interval '1 hour')`,
    [activeShiftId, organizationId, locationId, membershipId],
  );
  await client.query(
    `INSERT INTO shifts
       (id, organization_id, location_id, membership_id, status,
        started_at, ended_at)
     VALUES ($1, $2, $3, $4, 'ENDED',
             transaction_timestamp() - interval '2 hours',
             transaction_timestamp() - interval '1 hour')`,
    [endedShiftId, organizationId, locationId, membershipId],
  );
  await applyMigration(expectedMigrationDirectories[26]);
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

describe("migration 27 cash reconciliation", () => {
  it("is exactly migration 27 and adds nullable typed Shift columns", async () => {
    const directories = (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual([...expectedMigrationDirectories]);
    expect(directories).toHaveLength(30);
    expect(directories[26]).toBe("20260816002700_phase6_cash_reconciliation");
    const columns = await client.query(
      `SELECT column_name, data_type, numeric_precision, numeric_scale,
              is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'shifts'
         AND column_name LIKE 'cash_%'
       ORDER BY column_name`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "cash_currency",
      "cash_expected",
      "cash_reported",
      "cash_reported_at",
      "cash_reported_by_membership_id",
      "cash_variance",
    ]);
    expect(columns.rows.every((row) => row.is_nullable === "YES")).toBe(true);
    for (const column of ["cash_expected", "cash_reported", "cash_variance"]) {
      expect(
        columns.rows.find((row) => row.column_name === column),
      ).toMatchObject({
        data_type: "numeric",
        numeric_precision: 14,
        numeric_scale: 3,
      });
    }
  });

  it("preserves legacy rows as null inheritance-compatible snapshots", async () => {
    const result = await client.query(
      `SELECT cash_expected, cash_reported, cash_variance, cash_reported_at
       FROM shifts WHERE id = $1`,
      [endedShiftId],
    );
    expect(result.rows[0]).toEqual({
      cash_expected: null,
      cash_reported: null,
      cash_reported_at: null,
      cash_variance: null,
    });
  });

  it("rejects partial, negative, inconsistent, and rewritten snapshots", async () => {
    await expect(
      client.query(
        `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp(),
           cash_expected = -1, cash_reported = 0, cash_variance = 1,
           cash_currency = 'JOD', cash_reported_at = transaction_timestamp(),
           cash_reported_by_membership_id = $2
         WHERE id = $1`,
        [activeShiftId, membershipId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      client.query(`UPDATE shifts SET cash_expected = 1 WHERE id = $1`, [
        activeShiftId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp(),
         cash_expected = 10, cash_reported = 9, cash_variance = -1,
         cash_currency = 'JOD', cash_reported_at = transaction_timestamp(),
         cash_reported_by_membership_id = $2
       WHERE id = $1`,
      [activeShiftId, membershipId],
    );
    await expect(
      client.query(`UPDATE shifts SET cash_reported = 8 WHERE id = $1`, [
        activeShiftId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
