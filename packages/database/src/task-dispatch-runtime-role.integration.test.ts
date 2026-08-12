import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDispatchEvent,
  createTask,
  createTaskDispatchScope,
} from "./task-dispatch-fixture.js";

interface PgError extends Error {
  code?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_005d_role_${suffix}`;
const runtimeRole = `valet_005d_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;
let runtimePool: Pool;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runScript(
  args: string[],
  migrationUrl: string,
  runtimeUrl?: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        NODE_ENV: "test",
      },
    });
    let output = "";
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database script failed: ${output}`)),
    );
  });
}

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as PgError).code).toBe("42501");
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const migrationUrl = scopedUrl();
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  await runScript([prismaCli, "migrate", "deploy"], migrationUrl);
  await runScript(
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    runtimeUrl,
  );
  adminPool = new Pool({ connectionString: migrationUrl });
  runtimePool = new Pool({ connectionString: runtimeUrl });
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("DEC-034 runtime privileges", () => {
  it("permits Task current-projection operations without delete authority", async () => {
    const scope = await createTaskDispatchScope(adminPool);
    const taskId = await createTask(runtimePool, scope);
    await expect(
      runtimePool.query(`SELECT id FROM tasks WHERE id = $1`, [taskId]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      runtimePool.query(
        `UPDATE tasks SET status = 'ASSIGNED',
          current_assignee_membership_id = $1, version = version + 1,
          updated_at = transaction_timestamp() WHERE id = $2`,
        [scope.membershipId, taskId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectDenied(
      runtimePool.query(`DELETE FROM tasks WHERE id = $1`, [taskId]),
    );
    await expectDenied(runtimePool.query(`TRUNCATE tasks`));
  });

  it("keeps DispatchEvent and all prior history tables append-only", async () => {
    const scope = await createTaskDispatchScope(adminPool);
    const taskId = await createTask(adminPool, scope);
    const eventId = await createDispatchEvent(
      runtimePool,
      scope,
      taskId,
      "QUEUED",
      null,
      null,
    );
    await expect(
      runtimePool.query(`SELECT id FROM dispatch_events WHERE id = $1`, [
        eventId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectDenied(
      runtimePool.query(
        `UPDATE dispatch_events SET reason = 'rewrite' WHERE id = $1`,
        [eventId],
      ),
    );
    await expectDenied(
      runtimePool.query(`DELETE FROM dispatch_events WHERE id = $1`, [eventId]),
    );
    await expectDenied(runtimePool.query(`TRUNCATE dispatch_events`));
    const appendOnly = [
      "audit_events",
      "condition_notes",
      "vehicle_photos",
      "intake_operations",
      "key_custody_events",
      "dispatch_events",
    ];
    const grants = await adminPool.query<{
      grantee: string;
      privilege_type: string;
      table_name: string;
    }>(
      `SELECT grantee, table_name, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
         AND grantee IN ($2, 'PUBLIC')
         AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')`,
      [appendOnly, runtimeRole],
    );
    expect(grants.rows).toEqual([]);
  });
});
