import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";
import { createTaskDispatchScope } from "./task-dispatch-fixture.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_005d_upgrade_${process.pid}_${Date.now()}`;
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
}, 60_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("VAL-005D baseline upgrade", () => {
  it("applies 1-19 then 20 without synthesizing operational rows", async () => {
    const baseline = expectedMigrationDirectories.slice(0, 19);
    for (const migration of baseline) {
      await client.query(
        await readFile(
          join(migrationsPath, migration, "migration.sql"),
          "utf8",
        ),
      );
    }
    const scope = await createTaskDispatchScope(client);
    await client.query(
      `UPDATE valet_sessions SET current_assignee_membership_id = $1
       WHERE id = $2`,
      [scope.membershipId, scope.valetSessionId],
    );
    await client.query(
      await readFile(
        join(
          migrationsPath,
          "20260812002000_phase3_task_dispatch_persistence",
          "migration.sql",
        ),
        "utf8",
      ),
    );
    const session = await client.query<{
      current_assignee_membership_id: string;
    }>(
      `SELECT current_assignee_membership_id FROM valet_sessions WHERE id = $1`,
      [scope.valetSessionId],
    );
    expect(session.rows[0]?.current_assignee_membership_id).toBe(
      scope.membershipId,
    );
    for (const table of ["tasks", "dispatch_events"]) {
      const rows = await client.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM ${table}`,
      );
      expect(rows.rows[0]?.count).toBe(0);
    }
  });
});
