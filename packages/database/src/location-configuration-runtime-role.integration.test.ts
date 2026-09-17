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
const databaseName = `valet_009b_role_${suffix}`;
const runtimeRole = `valet_009b_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;

const mutationFunctions = [
  "public.location_configuration_set_override(uuid,uuid,text,text,timestamp with time zone)",
  "public.location_configuration_clear_override(uuid,uuid,text,timestamp with time zone)",
];
const helperFunctions = [
  "public.location_configuration_authorized_organization(uuid,uuid)",
  "public.location_configuration_setting_state(uuid,text)",
  "public.location_configuration_append_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
];

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

describe("VAL-009B location configuration runtime privileges", () => {
  it("keeps the schema at exactly 43 applied migrations", async () => {
    const result = await adminPool.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
       ORDER BY migration_name`,
    );
    expect(result.rows).toHaveLength(43);
    expect(result.rows.at(-1)?.migration_name).toBe(
      "20260917004300_mgt_be_10_kpi_analytics",
    );
  });

  it("grants EXECUTE only on the two mutation functions with safe definition flags", async () => {
    for (const functionName of mutationFunctions) {
      const result = await adminPool.query<{
        owner_safe: boolean;
        public_denied: boolean;
        runtime_allowed: boolean;
        search_path_safe: boolean;
        security_definer: boolean;
      }>(
        `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
                function.prosecdef AS security_definer,
                owner.rolname <> $1 AS owner_safe,
                function.proconfig =
                  ARRAY['search_path=pg_catalog, public']::text[]
                  AS search_path_safe,
                NOT EXISTS (
                  SELECT 1 FROM pg_proc AS candidate
                  CROSS JOIN LATERAL aclexplode(
                    COALESCE(candidate.proacl,
                             acldefault('f', candidate.proowner))
                  ) AS privilege
                  WHERE candidate.oid = to_regprocedure($2)
                    AND privilege.grantee = 0
                    AND privilege.privilege_type = 'EXECUTE'
                ) AS public_denied
         FROM pg_proc AS function
         INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
         WHERE function.oid = to_regprocedure($2)`,
        [runtimeRole, functionName],
      );
      expect(result.rows[0]).toEqual({
        owner_safe: true,
        public_denied: true,
        runtime_allowed: true,
        search_path_safe: true,
        security_definer: true,
      });
    }
    for (const functionName of helperFunctions) {
      const denied = await adminPool.query<{ runtime_allowed: boolean }>(
        `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed`,
        [runtimeRole, functionName],
      );
      expect(denied.rows[0]).toEqual({ runtime_allowed: false });
    }
  });

  it("keeps organizations and locations read-only with no generic UPDATE", async () => {
    const result = await adminPool.query<{
      can_update: boolean;
      table_name: string;
    }>(
      `SELECT table_name,
              has_table_privilege($1, format('public.%I', table_name),
                                  'UPDATE') AS can_update
       FROM unnest(ARRAY['organizations', 'locations']) AS table_name
       ORDER BY table_name`,
      [runtimeRole],
    );
    expect(result.rows).toEqual([
      { can_update: false, table_name: "locations" },
      { can_update: false, table_name: "organizations" },
    ]);
    for (const column of [
      "check_in_photos_required_override",
      "currency",
      "handoff_standard_method_policy_override",
      "status",
      "timezone",
      "valet_service_fee_override",
    ]) {
      const denied = await adminPool.query<{ allowed: boolean }>(
        `SELECT has_column_privilege($1, 'public.locations', $2,
                                     'UPDATE') AS allowed`,
        [runtimeRole, column],
      );
      expect(denied.rows[0]).toEqual({ allowed: false });
    }
  });

  it("executes the narrow function end to end as the runtime role while direct UPDATE fails", async () => {
    const organizationId = randomUUID();
    const locationId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    await adminPool.query(
      `INSERT INTO organizations (id, name, timezone, updated_at)
       VALUES ($1, 'Runtime config tenant', 'Asia/Amman',
               transaction_timestamp())`,
      [organizationId],
    );
    await adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, updated_at)
       VALUES ($1, $2, 'Runtime config location', $3, 'Address',
               'Asia/Amman', 'JOD', 'ACTIVE', transaction_timestamp())`,
      [locationId, organizationId, randomUUID()],
    );
    await adminPool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
               transaction_timestamp())`,
      [userId, `${userId}@009b-runtime.test`],
    );
    await adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'LOCATION_MANAGER', 'ACTIVE',
               transaction_timestamp())`,
      [membershipId, organizationId, userId],
    );
    await adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
      [organizationId, membershipId, locationId],
    );

    const runtime = new Client({
      connectionString: scopedUrl(runtimeRole, runtimePassword),
    });
    await runtime.connect();
    try {
      const current = await runtime.query<{ updated_at: Date }>(
        `SELECT updated_at FROM locations WHERE id = $1`,
        [locationId],
      );
      const token = await runtime.query<{ token: Date }>(
        `SELECT location_configuration_set_override(
            $1, $2, 'tipsEnabled', 'true', $3) AS token`,
        [membershipId, locationId, current.rows[0]!.updated_at],
      );
      expect(token.rows[0]!.token > current.rows[0]!.updated_at).toBe(true);
      await expect(
        runtime.query(
          `UPDATE locations SET tips_enabled_override = false WHERE id = $1`,
          [locationId],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.end();
    }
    const audits = await adminPool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events
       WHERE entity_type = 'Location'
         AND event_type = 'LOCATION_CONFIGURATION_OVERRIDE_SET'`,
    );
    expect(Number(audits.rows[0]!.n)).toBe(1);
  });
});
