import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_006f_policy_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);
let client: Client;

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    await client.query(
      await readFile(join(migrationsPath, migration, "migration.sql"), "utf8"),
    );
  }
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("DEC-041 secure handoff policy persistence", () => {
  it("uses EITHER as Company default with nullable Location override", async () => {
    const organizationId = randomUUID();
    const locationId = randomUUID();
    await client.query(
      `INSERT INTO organizations (id, name, timezone)
       VALUES ($1, 'Handoff policy org', 'Asia/Amman')`,
      [organizationId],
    );
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency)
       VALUES ($1, $2, 'Pickup', 'PICKUP', 'Test', 'Asia/Amman', 'JOD')`,
      [locationId, organizationId],
    );
    const initial = await client.query<{
      company: string;
      location: string | null;
    }>(
      `SELECT organization.handoff_standard_method_policy::text AS company,
              location.handoff_standard_method_policy_override::text AS location
       FROM organizations AS organization
       INNER JOIN locations AS location ON location.organization_id = organization.id
       WHERE organization.id = $1 AND location.id = $2`,
      [organizationId, locationId],
    );
    expect(initial.rows[0]).toEqual({ company: "EITHER", location: null });
    await client.query(
      `UPDATE locations
       SET handoff_standard_method_policy_override = 'PICKUP_CODE'
       WHERE id = $1`,
      [locationId],
    );
    await expect(
      client.query(
        `UPDATE organizations SET handoff_standard_method_policy = 'INVALID'
         WHERE id = $1`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: "22P02" });
  });

  it("accepts only the six durable anti-abuse scopes", async () => {
    for (const scope of [
      "v1:staff-login-identifier",
      "v1:staff-client-address",
      "v1:guest-client-address",
      "v1:guest-token",
      "v1:handoff-issuance-session",
      "v1:handoff-verification-session",
    ]) {
      await expect(
        client.query(
          `INSERT INTO anti_abuse_events (scope, key_hash, state)
           VALUES ($1, $2, 'COUNTED')`,
          [scope, `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    }
    await expect(
      client.query(
        `INSERT INTO anti_abuse_events (scope, key_hash, state)
         VALUES ('v1:handoff-unknown', $1, 'COUNTED')`,
        [`anti-abuse-hmac-sha256:v1:${"b".repeat(64)}`],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "anti_abuse_events_scope_check",
    });
  });
});
