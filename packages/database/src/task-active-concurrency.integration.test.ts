import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";
import { createTaskDispatchScope } from "./task-dispatch-fixture.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_005d_race_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);
let first: Client;
let second: Client;

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  first = new Client({ connectionString: url.toString() });
  second = new Client({ connectionString: url.toString() });
  await Promise.all([first.connect(), second.connect()]);
  for (const migration of expectedMigrationDirectories) {
    await first.query(
      await readFile(join(migrationsPath, migration, "migration.sql"), "utf8"),
    );
  }
}, 120_000);

afterAll(async () => {
  await Promise.all([first?.end(), second?.end()]);
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("DEC-034 active Task concurrency", () => {
  it("allows exactly one concurrent active intended operation", async () => {
    const scope = await createTaskDispatchScope(first);
    const insert = (client: Client) =>
      client.query(
        `INSERT INTO tasks
           (id, organization_id, location_id, valet_session_id, task_type,
            status, updated_at)
         VALUES ($1, $2, $3, $4, 'PARKING', 'QUEUED', transaction_timestamp())`,
        [
          randomUUID(),
          scope.organizationId,
          scope.locationId,
          scope.valetSessionId,
        ],
      );
    await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
    await insert(first);
    const competingInsert = insert(second).then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    await first.query("COMMIT");
    const { error } = await competingInsert;
    try {
      expect(error).not.toBeNull();
      const pgError = error as PgError;
      expect(pgError.code).toBe("23505");
      expect(pgError.constraint).toBe(
        "tasks_one_active_per_valet_session_task_type_idx",
      );
    } finally {
      await second.query("ROLLBACK");
    }
    const rows = await first.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM tasks
       WHERE valet_session_id = $1 AND task_type = 'PARKING'
         AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')`,
      [scope.valetSessionId],
    );
    expect(rows.rows[0]?.count).toBe(1);
  });
});
