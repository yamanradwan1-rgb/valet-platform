import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface PgError extends Error {
  code?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_mgt_be07_role_${suffix}`;
const runtimeRole = `valet_mgt_be07_runtime_${suffix}`;
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

function runScript(args: string[], runtimeUrl?: string): void {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: scopedUrl(),
      NODE_ENV: "test",
    },
    stdio: "pipe",
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
  runScript([prismaCli, "migrate", "deploy"]);
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  adminPool = new Pool({ connectionString: scopedUrl() });
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

describe("MGT-BE-07 Location lifecycle runtime privileges", () => {
  it("allows only the six public lifecycle commands and keeps helpers private", async () => {
    const rows = await adminPool.query<{
      name: string;
      public_denied: boolean;
      runtime_allowed: boolean;
      security_definer: boolean;
      search_path_safe: boolean;
    }>(
      `SELECT function.proname AS name,
              has_function_privilege($1,function.oid,'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
                WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
              ) AS public_denied
       FROM pg_proc function
       JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
       WHERE namespace.nspname='public' AND function.proname LIKE 'management_location_%'
       ORDER BY function.proname`,
      [runtimeRole],
    );
    expect(rows.rows.map((row) => [row.name, row.runtime_allowed])).toEqual([
      ["management_location_activate", true],
      ["management_location_append_audit", false],
      ["management_location_authorize_actor", false],
      ["management_location_correct_currency", true],
      ["management_location_correct_timezone", true],
      ["management_location_create", true],
      ["management_location_deactivate", true],
      ["management_location_guard_audit_event", false],
      ["management_location_has_blockers", false],
      ["management_location_lock", false],
      ["management_location_resume_intake", true],
      ["management_location_stop_intake", true],
    ]);
    for (const row of rows.rows) {
      expect(row.public_denied).toBe(true);
      expect(row.security_definer).toBe(
        row.name !== "management_location_guard_audit_event",
      );
      expect(row.search_path_safe).toBe(true);
    }
    const settingsHelper = await adminPool.query<{
      public_denied: boolean;
      runtime_allowed: boolean;
    }>(
      `SELECT has_function_privilege($1,function.oid,'EXECUTE') AS runtime_allowed,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
                WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
              ) AS public_denied
       FROM pg_proc function
       WHERE function.oid='public.management_settings_authorize_actor(uuid,uuid,uuid)'::regprocedure`,
      [runtimeRole],
    );
    expect(settingsHelper.rows[0]).toEqual({
      public_denied: true,
      runtime_allowed: false,
    });
  });

  it("denies generic Location inserts, lifecycle updates, and deletes", async () => {
    const privileges = await adminPool.query<Record<string, boolean>>(
      `SELECT has_table_privilege($1,'public.locations','SELECT') AS can_select,
              has_table_privilege($1,'public.locations','INSERT') AS can_insert,
              has_table_privilege($1,'public.locations','UPDATE') AS can_update,
              has_table_privilege($1,'public.locations','DELETE') AS can_delete,
              has_column_privilege($1,'public.locations','status','UPDATE') AS can_update_status,
              has_column_privilege($1,'public.locations','accepting_intake','UPDATE') AS can_update_intake`,
      [runtimeRole],
    );
    expect(privileges.rows[0]).toEqual({
      can_delete: false,
      can_insert: false,
      can_select: true,
      can_update: false,
      can_update_intake: false,
      can_update_status: false,
    });
    await expectDenied(
      runtimePool.query(
        `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
         VALUES($1,$2,'Denied','DENIED','Address','Asia/Amman','JOD',transaction_timestamp())`,
        [randomUUID(), randomUUID()],
      ),
    );
    await expectDenied(
      runtimePool.query(`UPDATE locations SET status='ACTIVE' WHERE FALSE`),
    );
    await expectDenied(runtimePool.query(`DELETE FROM locations WHERE FALSE`));
  });

  it.each(["LOCATION_CREATED", "LOCATION_INTAKE_RESUMED"])("denies forged %s audit while retaining ordinary append authority", async (eventType) => {
    const organizationId = randomUUID();
    await adminPool.query(
      `INSERT INTO organizations(id,name,status,timezone,updated_at)
       VALUES($1,'Lifecycle audit guard','ACTIVE','Asia/Amman',clock_timestamp())`,
      [organizationId],
    );
    await expectDenied(
      runtimePool.query(
        `INSERT INTO audit_events(
           id,organization_id,actor_type,event_type,entity_type,entity_id,
           metadata_json,idempotency_key,occurred_at)
         VALUES($1,$2,'SYSTEM',$5,'Location',$3,
                '{}'::jsonb,$4,clock_timestamp())`,
        [randomUUID(), organizationId, randomUUID(), randomUUID(), eventType],
      ),
    );
    await expect(
      runtimePool.query(
        `INSERT INTO audit_events(
           id,organization_id,actor_type,event_type,entity_type,entity_id,
           metadata_json,occurred_at)
         VALUES($1,$2,'SYSTEM','RUNTIME_AUDIT_GUARD_CANARY','Location',$3,
                '{}'::jsonb,clock_timestamp())`,
        [randomUUID(), organizationId, randomUUID()],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it("rejects NULL create identity and timezone correction reason at the runtime command boundary", async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const locationId = randomUUID();
    await adminPool.query(
      `INSERT INTO organizations(id,name,status,timezone,updated_at)
       VALUES($1,'Lifecycle null guard','ACTIVE','Asia/Amman',clock_timestamp())`,
      [organizationId],
    );
    await adminPool.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,'test-hash','ACTIVE',clock_timestamp())`,
      [userId, `${userId}@be07.test`],
    );
    await adminPool.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
       VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp())`,
      [membershipId, organizationId, userId],
    );
    await adminPool.query(
      `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
       VALUES($1,$2,'Null guard location',$3,'Address','Asia/Amman','JOD',clock_timestamp())`,
      [locationId, organizationId, `NULL-${locationId}`],
    );
    const create = await runtimePool.query<{ result_code: string }>(
      `SELECT result_code FROM management_location_create(
         $1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)`,
      [
        membershipId,
        organizationId,
        randomUUID(),
        "a".repeat(64),
        "Null operation",
        `NULL-OP-${randomUUID()}`,
        "Address",
        "Asia/Amman",
        "JOD",
      ],
    );
    expect(create.rows[0]?.result_code).toBe("CONFIGURATION_VALUE_INVALID");
    const before = await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id=$1`,
      [locationId],
    );
    const timezone = await runtimePool.query<{ result_code: string }>(
      `SELECT result_code FROM management_location_correct_timezone(
         $1,$2,$3,'UTC',NULL,$4)`,
      [membershipId, organizationId, locationId, before.rows[0]!.updated_at],
    );
    expect(timezone.rows[0]?.result_code).toBe("CONFIGURATION_VALUE_INVALID");
    const persisted = await adminPool.query<{
      count: string;
      timezone: string;
    }>(
      `SELECT count(*) FILTER (WHERE code LIKE 'NULL-OP-%')::text AS count,
              min(timezone) FILTER (WHERE id=$1) AS timezone
       FROM locations WHERE organization_id=$2`,
      [locationId, organizationId],
    );
    expect(persisted.rows[0]).toEqual({ count: "0", timezone: "Asia/Amman" });
  });

  it("reconciles stale helper and grant-option privileges", async () => {
    const command =
      "public.management_location_activate(uuid,uuid,uuid,timestamp with time zone)";
    const helper = "public.management_location_lock(uuid,boolean)";
    await adminPool.query(`GRANT EXECUTE ON FUNCTION ${helper} TO PUBLIC`);
    await adminPool.query(
      `GRANT EXECUTE ON FUNCTION ${command} TO "${runtimeRole}" WITH GRANT OPTION`,
    );
    runScript(
      ["scripts/provision-runtime-role.mjs"],
      scopedUrl(runtimeRole, runtimePassword),
    );
    const state = await adminPool.query<Record<string, boolean>>(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS command_allowed,
              has_function_privilege($1,$3,'EXECUTE') AS helper_allowed,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
                JOIN pg_roles grantee ON grantee.oid=privilege.grantee
                WHERE grantee.rolname=$1 AND privilege.privilege_type='EXECUTE'
                  AND privilege.is_grantable
              ) AS command_grant_option_denied
       FROM pg_proc function WHERE function.oid=to_regprocedure($2)`,
      [runtimeRole, command, helper],
    );
    expect(state.rows[0]).toEqual({
      command_allowed: true,
      command_grant_option_denied: true,
      helper_allowed: false,
    });
  });
});
