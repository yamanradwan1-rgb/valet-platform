import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_008d_role_${suffix}`;
const runtimeRole = `valet_008d_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runDatabaseScript(
  command: string,
  args: string[],
  migrationUrl: string,
  runtimeUrl?: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        NODE_ENV: "test",
      },
      windowsHide: true,
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

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const migrationUrl = scopedUrl();
  await runDatabaseScript(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    migrationUrl,
  );
  await runDatabaseScript(
    process.execPath,
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    scopedUrl(runtimeRole, runtimePassword),
  );
  adminPool = new Pool({ connectionString: migrationUrl });
}, 120_000);

afterAll(async () => {
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("VAL-008D payment collection runtime privileges", () => {
  it("grants only SELECT and INSERT at table level", async () => {
    const result = await adminPool.query(
      `SELECT privilege,
              has_table_privilege(
                $1, 'public.payment_collection_operations', privilege
              ) AS allowed
       FROM unnest(ARRAY[
         'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
         'REFERENCES', 'TRIGGER'
       ]) AS privilege
       ORDER BY privilege`,
      [runtimeRole],
    );
    expect(result.rows).toEqual([
      { allowed: false, privilege: "DELETE" },
      { allowed: true, privilege: "INSERT" },
      { allowed: false, privilege: "REFERENCES" },
      { allowed: true, privilege: "SELECT" },
      { allowed: false, privilege: "TRIGGER" },
      { allowed: false, privilege: "TRUNCATE" },
      { allowed: false, privilege: "UPDATE" },
    ]);
  });

  it("limits UPDATE to operational projection columns", async () => {
    const result = await adminPool.query(
      `SELECT column_name,
              has_column_privilege(
                $1, 'public.payment_collection_operations',
                column_name, 'UPDATE'
              ) AS allowed
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_collection_operations'
       ORDER BY ordinal_position`,
      [runtimeRole],
    );
    const mutable = new Set([
      "state",
      "provider_reference",
      "safe_result_code",
      "dispatch_guarded_at",
      "resolved_at",
      "updated_at",
    ]);
    expect(result.rows).toHaveLength(14);
    for (const row of result.rows) {
      expect(row.allowed).toBe(mutable.has(row.column_name));
    }
  });
});
