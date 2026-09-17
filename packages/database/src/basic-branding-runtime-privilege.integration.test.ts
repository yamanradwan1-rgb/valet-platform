import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_009f_role_${suffix}`;
const runtimeRole = `valet_009f_runtime_${suffix}`;
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
  execFileSync(command, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    },
    stdio: "pipe",
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

describe("VAL-009F runtime privileges for G8 surfaces", () => {
  it("keeps the schema at exactly 43 applied migrations", async () => {
    const result = await adminPool.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(result.rows).toHaveLength(43);
  });

  it("grants SELECT only on organization_subscriptions", async () => {
    const matrix = await adminPool.query<Record<string, boolean>>(
      `SELECT has_table_privilege($1, 'public.organization_subscriptions',
                                    'SELECT') AS can_select,
              has_table_privilege($1, 'public.organization_subscriptions',
                                  'INSERT') AS can_insert,
              has_table_privilege($1, 'public.organization_subscriptions',
                                  'UPDATE') AS can_update,
              has_table_privilege($1, 'public.organization_subscriptions',
                                  'DELETE') AS can_delete,
              has_table_privilege($1, 'public.organization_subscriptions',
                                  'TRUNCATE') AS can_truncate
       `,
      [runtimeRole],
    );
    expect(matrix.rows[0]).toEqual({
      can_delete: false,
      can_insert: false,
      can_select: true,
      can_truncate: false,
      can_update: false,
    });
  });

  it("keeps generic Organization/Location UPDATE denied for runtime", async () => {
    const result = await adminPool.query<{ can_update: boolean }>(
      `SELECT has_table_privilege($1, 'public.organizations', 'UPDATE')
         AS can_update`,
      [runtimeRole],
    );
    expect(result.rows[0]!.can_update).toBe(false);
    const locations = await adminPool.query<{ can_update: boolean }>(
      `SELECT has_table_privilege($1, 'public.locations', 'UPDATE')
         AS can_update`,
      [runtimeRole],
    );
    expect(locations.rows[0]!.can_update).toBe(false);
  });
});
