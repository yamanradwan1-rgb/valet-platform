import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
interface PostgresError extends Error { code?: string; constraint?: string }
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_audit_role_${suffix}`;
const runtimeRole = `valet_audit_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
let adminPool: Pool;
let runtimePool: Pool;
let databaseCreated = false;
function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}
async function runDatabaseScript(
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
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database script failed with code ${code}: ${output}`)),
    );
  });
}
async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as PostgresError).code).toBe("42501");
  }
}
beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
  } finally {
    await bootstrap.end();
  }
  const migrationUrl = scopedUrl();
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  await runDatabaseScript([prismaCli, "migrate", "deploy"], migrationUrl);
  await runDatabaseScript(
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
  try {
    if (databaseCreated) {
      await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);
describe("MGT-BE-01 audit foundation runtime role", () => {
  it("applies all migrations and keeps both audit tables non-owned and PUBLIC-denied", async () => {
    const migrations = await adminPool.query<{ latest: string; n: number }>(
      `SELECT count(*)::int AS n, max(migration_name) AS latest FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(migrations.rows[0]).toEqual({
      latest: "20260916003800_mgt_be_05_company_settings_branding",
      n: 38,
    });
    const tables = await adminPool.query<{ owner_safe: boolean; public_denied: boolean; table_name: string }>(
      `SELECT relation.relname AS table_name,
              owner.rolname <> $1 AS owner_safe,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(
                  COALESCE(relation.relacl,
                           acldefault('r', relation.relowner))
                ) AS privilege
                WHERE privilege.grantee = 0
                  AND privilege.privilege_type IN
                    ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
              ) AS public_denied
       FROM pg_class AS relation
       INNER JOIN pg_roles AS owner ON owner.oid = relation.relowner
       WHERE relation.oid IN
         ('public.audit_events'::regclass,
          'public.account_security_audit_events'::regclass)
       ORDER BY relation.relname`,
      [runtimeRole],
    );
    expect(tables.rows).toEqual([
      { owner_safe: true, public_denied: true, table_name: "account_security_audit_events" },
      { owner_safe: true, public_denied: true, table_name: "audit_events" },
    ]);
  });
  it("allows only safe tenant audit INSERT columns plus SELECT", async () => {
    const organizationId = randomUUID();
    const auditId = randomUUID();
    await adminPool.query(
      `INSERT INTO organizations (id, name, timezone, updated_at)
       VALUES ($1, 'Audit runtime tenant', 'Asia/Amman', transaction_timestamp())`,
      [organizationId],
    );
    await runtimePool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, actor_type, event_type, entity_type,
          entity_id, metadata_json, occurred_at)
       VALUES ($1, $2, NULL, NULL, NULL, 'SYSTEM',
               'TEST_RUNTIME_TENANT_AUDIT', 'Organization', $2,
               '{}'::jsonb, transaction_timestamp())`,
      [auditId, organizationId],
    );
    await expect(
      runtimePool.query(`SELECT id FROM audit_events WHERE id = $1`, [auditId]),
    ).resolves.toMatchObject({ rowCount: 1 });
    const privileges = await adminPool.query<Record<string, boolean>>(
      `SELECT has_table_privilege($1, 'public.audit_events', 'SELECT') AS can_select,
              has_table_privilege($1, 'public.audit_events', 'INSERT') AS can_insert,
              has_table_privilege($1, 'public.audit_events', 'UPDATE') AS can_update,
              has_table_privilege($1, 'public.audit_events', 'DELETE') AS can_delete,
              has_table_privilege($1, 'public.audit_events', 'TRUNCATE') AS can_truncate,
              has_table_privilege($1, 'public.audit_events', 'REFERENCES') AS can_reference,
              has_table_privilege($1, 'public.audit_events', 'TRIGGER') AS can_trigger`,
      [runtimeRole],
    );
    expect(privileges.rows[0]).toEqual({
      can_delete: false,
      can_insert: false,
      can_reference: false,
      can_select: true,
      can_trigger: false,
      can_truncate: false,
      can_update: false,
    });
    const insertColumns = await adminPool.query<{ allowed: boolean; column_name: string }>(
      `SELECT column_name,
              has_column_privilege($1, 'public.audit_events', column_name, 'INSERT') AS allowed
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audit_events'
       ORDER BY ordinal_position`,
      [runtimeRole],
    );
    expect(insertColumns.rows.filter((row) => row.allowed).map((row) => row.column_name)).toEqual([
      "id", "organization_id", "location_id", "valet_session_id", "actor_membership_id", "event_type",
      "entity_type", "entity_id", "metadata_json", "idempotency_key", "occurred_at", "actor_type",
    ]);
    await expect(
      runtimePool.query(
        `INSERT INTO audit_events
           (id, organization_id, actor_type, event_type, entity_type,
            entity_id, metadata_json, occurred_at)
         VALUES ($1, $2, 'CONTROLLED_OPERATOR', 'TEST_FORGED_OPERATOR',
                 'Organization', $2, '{}'::jsonb, transaction_timestamp())`,
        [randomUUID(), organizationId],
      ),
    ).rejects.toMatchObject({ code: "23514", constraint: "audit_events_actor_provenance_check" });
    await expectDenied(
      runtimePool.query(
        `INSERT INTO audit_events
           (id, organization_id, actor_type, controlled_operator_ref,
            event_type, entity_type, entity_id, metadata_json, occurred_at)
         VALUES ($1, $2, 'CONTROLLED_OPERATOR', 'forged-ref', 'TEST_FORGED_OPERATOR',
                 'Organization', $2, '{}'::jsonb, transaction_timestamp())`,
        [randomUUID(), organizationId],
      ),
    );
    await expectDenied(
      runtimePool.query(`UPDATE audit_events SET event_type = event_type WHERE id = $1`, [auditId]),
    );
    await expectDenied(runtimePool.query(`DELETE FROM audit_events WHERE id = $1`, [auditId]));
    await expectDenied(runtimePool.query(`TRUNCATE audit_events`));
  });
  it("denies direct account-security access including CONTROLLED_OPERATOR forgery", async () => {
    const privileges = await adminPool.query<Record<string, boolean>>(
      `SELECT has_table_privilege($1, 'public.account_security_audit_events', 'SELECT') AS can_select,
              has_table_privilege($1, 'public.account_security_audit_events', 'INSERT') AS can_insert,
              has_table_privilege($1, 'public.account_security_audit_events', 'UPDATE') AS can_update,
              has_table_privilege($1, 'public.account_security_audit_events', 'DELETE') AS can_delete,
              has_table_privilege($1, 'public.account_security_audit_events', 'TRUNCATE') AS can_truncate,
              has_table_privilege($1, 'public.account_security_audit_events', 'REFERENCES') AS can_reference,
              has_table_privilege($1, 'public.account_security_audit_events', 'TRIGGER') AS can_trigger`,
      [runtimeRole],
    );
    expect(Object.values(privileges.rows[0] ?? {})).toEqual(Array(7).fill(false));
    const columns = await adminPool.query<{ allowed: boolean }>(
      `SELECT has_column_privilege($1, 'public.account_security_audit_events',
                                   column_name, 'INSERT') AS allowed
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'account_security_audit_events'`,
      [runtimeRole],
    );
    expect(columns.rows.every((row) => row.allowed === false)).toBe(true);
    await expectDenied(
      runtimePool.query(
        `INSERT INTO account_security_audit_events
           (id, event_type, actor_type, controlled_operator_ref, occurred_at)
         VALUES ($1, 'TEST_FORGED_OPERATOR', 'CONTROLLED_OPERATOR', 'forged-ref',
                 transaction_timestamp())`,
        [randomUUID()],
      ),
    );
    await expectDenied(runtimePool.query(`SELECT id FROM account_security_audit_events LIMIT 1`));
    await expectDenied(runtimePool.query(`UPDATE account_security_audit_events SET event_type = event_type`));
    await expectDenied(runtimePool.query(`DELETE FROM account_security_audit_events`));
    await expectDenied(runtimePool.query(`TRUNCATE account_security_audit_events`));
  });
  it("exposes only the runtime account append function and keeps exact retry idempotent", async () => {
    const runtimeFunction = "public.append_runtime_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,timestamp with time zone)";
    const controlledFunction = "public.append_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,text,timestamp with time zone)";
    const definitions = await adminPool.query<{
      function_name: string; owner_safe: boolean; public_denied: boolean;
      runtime_allowed: boolean; search_path_safe: boolean; security_definer: boolean;
    }>(
      `SELECT requested.function_name,
              has_function_privilege($1, requested.function_name, 'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              owner.rolname <> $1 AS owner_safe,
              function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
                AS search_path_safe,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(
                  COALESCE(function.proacl, acldefault('f', function.proowner))
                ) AS privilege
                WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM unnest($2::text[]) AS requested(function_name)
       INNER JOIN pg_proc AS function
         ON function.oid = to_regprocedure(requested.function_name)
       INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
       ORDER BY requested.function_name`,
      [runtimeRole, [controlledFunction, runtimeFunction]],
    );
    expect(definitions.rows).toEqual([
      { function_name: controlledFunction, owner_safe: true, public_denied: true, runtime_allowed: false,
        search_path_safe: true, security_definer: true },
      { function_name: runtimeFunction, owner_safe: true, public_denied: true, runtime_allowed: true,
        search_path_safe: true, security_definer: true },
    ]);
    const eventId = randomUUID();
    const occurredAt = new Date();
    const append = () => runtimePool.query<{ id: string }>(
      `SELECT append_runtime_account_security_audit_event(
         $1::uuid, 'TEST_FUNCTION_APPEND', NULL, 'SYSTEM', NULL, $2::timestamptz)::text AS id`,
      [eventId, occurredAt],
    );
    expect((await append()).rows[0]?.id).toBe(eventId);
    expect((await append()).rows[0]?.id).toBe(eventId);
    const count = await adminPool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM account_security_audit_events WHERE id = $1`,
      [eventId],
    );
    expect(count.rows[0]?.n).toBe("1");
    await expectDenied(runtimePool.query(
      `SELECT append_runtime_account_security_audit_event(
         $1::uuid, 'TEST_FORGED_OPERATOR', NULL, 'CONTROLLED_OPERATOR', NULL, transaction_timestamp())`,
      [randomUUID()],
    ));
    await expectDenied(runtimePool.query(
      `SELECT append_account_security_audit_event(
         $1::uuid, 'TEST_FORGED_OPERATOR', NULL, 'CONTROLLED_OPERATOR', NULL, 'forged-ref', transaction_timestamp())`,
      [randomUUID()],
    ));
  });
});
