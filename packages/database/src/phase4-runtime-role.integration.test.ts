import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_006a_role_${suffix}`;
const runtimeRole = `valet_006a_runtime_${suffix}`;
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
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  await runDatabaseScript(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    migrationUrl,
  );
  await runDatabaseScript(
    process.execPath,
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    runtimeUrl,
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

describe("DEC-039 Phase 4 runtime persistence privileges", () => {
  it("keeps the schema at the pinned migration count", async () => {
    const result = await adminPool.query<{ migration_name: string }>(
      `SELECT migration_name
       FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(result.rows).toHaveLength(expectedMigrationDirectories.length);
  });

  it("allows only stateful runtime access on RetrievalRequest and HandoffVerification", async () => {
    const result = await adminPool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_references: boolean;
      can_select: boolean;
      can_trigger: boolean;
      can_truncate: boolean;
      can_update: boolean;
      table_name: string;
    }>(
      `SELECT table_name,
              has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS can_select,
              has_table_privilege($1, format('public.%I', table_name), 'INSERT') AS can_insert,
              has_table_privilege($1, format('public.%I', table_name), 'UPDATE') AS can_update,
              has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS can_delete,
              has_table_privilege($1, format('public.%I', table_name), 'TRUNCATE') AS can_truncate,
              has_table_privilege($1, format('public.%I', table_name), 'REFERENCES') AS can_references,
              has_table_privilege($1, format('public.%I', table_name), 'TRIGGER') AS can_trigger
       FROM unnest(ARRAY['handoff_verifications', 'retrieval_requests']) AS table_name
       ORDER BY table_name`,
      [runtimeRole],
    );
    expect(result.rows).toEqual([
      {
        can_delete: false,
        can_insert: true,
        can_references: false,
        can_select: true,
        can_trigger: false,
        can_truncate: false,
        can_update: true,
        table_name: "handoff_verifications",
      },
      {
        can_delete: false,
        can_insert: true,
        can_references: false,
        can_select: true,
        can_trigger: false,
        can_truncate: false,
        can_update: true,
        table_name: "retrieval_requests",
      },
    ]);
  });

  it("preserves append-only Audit, Dispatch and KeyCustody boundaries", async () => {
    const result = await adminPool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_select: boolean;
      can_truncate: boolean;
      can_update: boolean;
      table_name: string;
    }>(
      `SELECT table_name,
              has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS can_select,
              CASE WHEN table_name = 'audit_events'
                THEN has_column_privilege($1, 'public.audit_events', 'id', 'INSERT')
                ELSE has_table_privilege($1, format('public.%I', table_name), 'INSERT')
              END AS can_insert,
              has_table_privilege($1, format('public.%I', table_name), 'UPDATE') AS can_update,
              has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS can_delete,
              has_table_privilege($1, format('public.%I', table_name), 'TRUNCATE') AS can_truncate
       FROM unnest(ARRAY['audit_events', 'dispatch_events', 'key_custody_events']) AS table_name
       ORDER BY table_name`,
      [runtimeRole],
    );
    expect(result.rows).toEqual(
      ["audit_events", "dispatch_events", "key_custody_events"].map(
        (tableName) => ({
          can_delete: false,
          can_insert: true,
          can_select: true,
          can_truncate: false,
          can_update: false,
          table_name: tableName,
        }),
      ),
    );
  });
});
