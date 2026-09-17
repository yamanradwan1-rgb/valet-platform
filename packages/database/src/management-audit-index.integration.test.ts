import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migration = "20260917003900_mgt_be_06_management_audit_log";
const migrationSqlUrl = new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url);
const databaseName = `valet_mgt_be06_index_${randomUUID().replaceAll("-", "")}`;
const organizationId = randomUUID();
const auditId = randomUUID();
let client: Client;

function databaseUrl(): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function indexColumns() {
  return client.query<{
    column_name: string;
    direction: string;
    position: number;
  }>(
    `SELECT attribute.attname AS column_name, key.ordinality::int AS position,
            CASE WHEN (index.indoption[key.ordinality - 1] & 1) = 1
                 THEN 'DESC' ELSE 'ASC' END AS direction
     FROM pg_index AS index
     INNER JOIN pg_class AS index_class ON index_class.oid = index.indexrelid
     INNER JOIN pg_class AS table_class ON table_class.oid = index.indrelid
     CROSS JOIN LATERAL unnest(index.indkey)
       WITH ORDINALITY AS key(attnum, ordinality)
     INNER JOIN pg_attribute AS attribute
       ON attribute.attrelid = table_class.oid AND attribute.attnum = key.attnum
     WHERE index_class.relname = 'audit_events_organization_id_occurred_at_id_idx'
     ORDER BY key.ordinality`,
  );
}

beforeAll(async () => {
  expect(expectedMigrationDirectories.indexOf(migration)).toBe(38);
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }

  client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  await client.query(
    `CREATE TABLE audit_events (
       id uuid PRIMARY KEY,
       organization_id uuid NOT NULL,
       event_type text NOT NULL,
       occurred_at timestamptz NOT NULL
     )`,
  );
  await client.query(
    `INSERT INTO audit_events (id,organization_id,event_type,occurred_at)
     VALUES ($1,$2,'PRESERVATION_CANARY',transaction_timestamp())`,
    [auditId, organizationId],
  );
  await client.query(await readFile(migrationSqlUrl, "utf8"));
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("MGT-BE-06 Management Audit chronology index", () => {
  it("creates only the measured Organization chronology key", async () => {
    const columns = await indexColumns();
    expect(columns.rows).toEqual([
      { column_name: "organization_id", direction: "ASC", position: 1 },
      { column_name: "occurred_at", direction: "DESC", position: 2 },
      { column_name: "id", direction: "DESC", position: 3 },
    ]);
  });

  it("preserves existing audit history while adding the index", async () => {
    const preserved = await client.query<{ event_type: string }>(
      `SELECT event_type FROM audit_events WHERE id = $1`,
      [auditId],
    );
    expect(preserved.rows).toEqual([{ event_type: "PRESERVATION_CANARY" }]);
  });
});
