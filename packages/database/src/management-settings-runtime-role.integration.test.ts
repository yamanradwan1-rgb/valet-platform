import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface PgError extends Error { code?: string }

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_mgt_be05_role_${suffix}`;
const runtimeRole = `valet_mgt_be05_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const runtimeFunctions = [
  "public.management_settings_set_company_scalar(uuid,uuid,text,text,timestamp with time zone)",
  "public.management_settings_set_location_scalar(uuid,uuid,uuid,text,text,timestamp with time zone)",
  "public.management_settings_clear_location_scalar(uuid,uuid,uuid,text,timestamp with time zone)",
  "public.management_settings_set_company_operating_hours(uuid,uuid,operating_weekday[],boolean[],time without time zone[],time without time zone[],timestamp with time zone)",
  "public.management_settings_clear_company_operating_hours(uuid,uuid,timestamp with time zone)",
  "public.management_settings_set_location_operating_hours(uuid,uuid,uuid,operating_weekday[],boolean[],time without time zone[],time without time zone[],timestamp with time zone)",
  "public.management_settings_clear_location_operating_hours(uuid,uuid,uuid,timestamp with time zone)",
  "public.management_branding_set_company_default(uuid,uuid,text,text,timestamp with time zone)",
  "public.management_branding_set_location_override(uuid,uuid,uuid,text,text,timestamp with time zone)",
  "public.management_branding_clear_location_override(uuid,uuid,uuid,text,timestamp with time zone)",
];
const privateFunctions = [
  "public.management_settings_lock_organization(uuid,boolean)",
  "public.management_settings_authorize_actor(uuid,uuid,uuid)",
  "public.management_settings_canonical_scalar_value(text,text)",
  "public.management_settings_company_scalar_state(uuid,text)",
  "public.management_settings_location_scalar_state(uuid,text)",
  "public.management_settings_fee_representable(text,numeric)",
  "public.management_settings_append_company_audit(uuid,uuid,text,text,text)",
  "public.management_settings_append_location_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
  "public.management_settings_validate_hours(operating_weekday[],boolean[],time without time zone[],time without time zone[])",
  "public.management_settings_canonical_hours(operating_weekday[],boolean[],time without time zone[],time without time zone[])",
  "public.management_branding_append_company_audit(uuid,uuid,text,text,text)",
  "public.management_branding_append_location_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
  "public.location_configuration_authorized_organization(uuid,uuid)",
  "public.location_branding_authorized_organization(uuid,uuid)",
];
const ids = {
  adminMembership: randomUUID(), adminUser: randomUUID(), locationA: randomUUID(),
  locationB: randomUUID(), managerMembership: randomUUID(), managerUser: randomUUID(),
  organizationA: randomUUID(), organizationB: randomUUID(),
};
const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
function weekdaySchedule(open: string, close: string) {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return {
    closed: [false, false, false, false, false, true, true],
    opens: [open, open, open, open, open, null, null],
    closes: [close, close, close, close, close, null, null],
    canonical: days.map((day, index) => index < 5
      ? `${day}=${open}:00-${close}:00` : `${day}=C`).join(";"),
  };
}
const scheduleA = weekdaySchedule("08:00", "17:00");
const scheduleB = weekdaySchedule("09:00", "18:00");
const locationSchedule = weekdaySchedule("07:00", "16:00");
let adminPool: Pool;
let runtimePool: Pool;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runScript(args: string[], runtimeUrl?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: runtimeUrl, MIGRATION_DATABASE_URL: scopedUrl(), NODE_ENV: "test" },
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Database script failed: ${output}`)));
  });
}

async function expectDenied(operation: Promise<unknown>, code = "42501"): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL error ${code}.`);
  } catch (error) {
    expect((error as PgError).code).toBe(code);
  }
}

async function functionSecurity(functions: string[]) {
  return (await adminPool.query<Record<string, boolean | string>>(
    `SELECT requested.function_name,
            has_function_privilege($1,requested.function_name,'EXECUTE') AS runtime_allowed,
            function.prosecdef AS security_definer,owner.rolname <> $1 AS owner_safe,
            function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
            NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) p
              WHERE p.grantee=0 AND p.privilege_type='EXECUTE') AS public_denied,
            NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) p
              JOIN pg_roles grantee ON grantee.oid=p.grantee WHERE grantee.rolname=$1
                AND p.privilege_type='EXECUTE' AND p.is_grantable) AS grant_option_denied
     FROM unnest($2::text[]) requested(function_name)
     JOIN pg_proc function ON function.oid=to_regprocedure(requested.function_name)
     JOIN pg_roles owner ON owner.oid=function.proowner ORDER BY requested.function_name`,
    [runtimeRole, functions],
  )).rows;
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try { await bootstrap.query(`CREATE DATABASE "${databaseName}"`); }
  finally { await bootstrap.end(); }
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  await runScript([prismaCli, "migrate", "deploy"]);
  await runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  await runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  adminPool = new Pool({ connectionString: scopedUrl() });
  runtimePool = new Pool({ connectionString: runtimeUrl });

  await adminPool.query(
    `INSERT INTO organizations(id,name,timezone,updated_at)
     VALUES($1,'Runtime A','Asia/Amman',transaction_timestamp()),
           ($2,'Runtime B','Asia/Amman',transaction_timestamp())`,
    [ids.organizationA, ids.organizationB],
  );
  await adminPool.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,'Runtime A location',$3,'Address','Asia/Amman','JOD',transaction_timestamp()),
           ($4,$5,'Runtime B location',$6,'Address','Asia/Amman','JOD',transaction_timestamp())`,
    [ids.locationA, ids.organizationA, `A-${ids.locationA}`, ids.locationB, ids.organizationB, `B-${ids.locationB}`],
  );
  await adminPool.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'test-hash','ACTIVE',transaction_timestamp()),
           ($3,$4,'test-hash','ACTIVE',transaction_timestamp())`,
    [ids.adminUser, `${ids.adminUser}@mgt05.test`, ids.managerUser, `${ids.managerUser}@mgt05.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',transaction_timestamp()),
           ($4,$2,$5,'LOCATION_MANAGER','ACTIVE',transaction_timestamp())`,
    [ids.adminMembership, ids.organizationA, ids.adminUser, ids.managerMembership, ids.managerUser],
  );
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("MGT-BE-05 Management settings runtime role", () => {
  it("provisions idempotently with only safe narrow function execution", async () => {
    const roleCount = await adminPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1`, [runtimeRole],
    );
    expect(roleCount.rows[0]?.n).toBe(1);
    for (const row of await functionSecurity(runtimeFunctions)) expect(row).toMatchObject({
      grant_option_denied: true, owner_safe: true, public_denied: true,
      runtime_allowed: true, search_path_safe: true, security_definer: true,
    });
    for (const row of await functionSecurity(privateFunctions)) expect(row).toMatchObject({
      grant_option_denied: true, owner_safe: true, public_denied: true,
      runtime_allowed: false, search_path_safe: true, security_definer: true,
    });
    await expectDenied(runtimePool.query(
      `SELECT management_settings_canonical_hours('{}','{}','{}','{}')`,
    ));
  });

  it("keeps normalized hours SELECT-only and denies direct settings writes", async () => {
    const privileges = await adminPool.query<Record<string, boolean | string>>(
      `SELECT table_name,has_table_privilege($1,'public.'||table_name,'SELECT') AS can_select,
              has_table_privilege($1,'public.'||table_name,'INSERT') AS can_insert,
              has_table_privilege($1,'public.'||table_name,'UPDATE') AS can_update,
              has_table_privilege($1,'public.'||table_name,'DELETE') AS can_delete,
              has_table_privilege($1,'public.'||table_name,'TRUNCATE') AS can_truncate,
              has_table_privilege($1,'public.'||table_name,'REFERENCES') AS can_reference,
              has_table_privilege($1,'public.'||table_name,'TRIGGER') AS can_trigger
       FROM unnest($2::text[]) table_name ORDER BY table_name`,
      [runtimeRole, ["organization_operating_hours", "location_operating_hours_overrides"]],
    );
    for (const row of privileges.rows) {
      expect(row).toMatchObject({
        can_delete: false, can_insert: false, can_reference: false,
        can_select: true, can_trigger: false, can_truncate: false, can_update: false,
      });
    }
    await expectDenied(runtimePool.query(`UPDATE organizations SET ocr_assist_enabled=false WHERE id=$1`, [ids.organizationA]));
    await expectDenied(runtimePool.query(`UPDATE locations SET ocr_assist_enabled_override=false WHERE id=$1`, [ids.locationA]));
    await expectDenied(runtimePool.query(
      `INSERT INTO organization_operating_hours(organization_id,weekday,is_closed) VALUES($1,'MONDAY',true)`,
      [ids.organizationA],
    ));
    await expectDenied(runtimePool.query(`DELETE FROM location_operating_hours_overrides WHERE location_id=$1`, [ids.locationA]));
  });

  it("allows authorized narrow mutations while wrong-role and cross-org calls fail", async () => {
    const orgToken = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM organizations WHERE id=$1`, [ids.organizationA],
    )).rows[0]!.updated_at;
    const scalar = await runtimePool.query<{ changed: boolean; updated_at: Date }>(
      `SELECT changed,updated_at FROM management_settings_set_company_scalar($1,$2,'languageDefault','AR',$3)`,
      [ids.adminMembership, ids.organizationA, orgToken],
    );
    expect(scalar.rows[0]?.changed).toBe(true);
    const hoursA = await runtimePool.query<{ changed: boolean; updated_at: Date }>(
      `SELECT changed,updated_at FROM management_settings_set_company_operating_hours(
         $1,$2,$3::operating_weekday[],$4::boolean[],$5::time[],$6::time[],$7)`,
      [ids.adminMembership, ids.organizationA, weekdays, scheduleA.closed,
        scheduleA.opens, scheduleA.closes, scalar.rows[0]!.updated_at],
    );
    const hoursB = await runtimePool.query<{ changed: boolean; updated_at: Date }>(
      `SELECT changed,updated_at FROM management_settings_set_company_operating_hours(
         $1,$2,$3::operating_weekday[],$4::boolean[],$5::time[],$6::time[],$7)`,
      [ids.adminMembership, ids.organizationA, weekdays, scheduleB.closed,
        scheduleB.opens, scheduleB.closes, hoursA.rows[0]!.updated_at],
    );
    expect(hoursA.rows[0]?.changed).toBe(true);
    expect(hoursB.rows[0]?.changed).toBe(true);
    const locationToken = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id=$1`, [ids.locationA],
    )).rows[0]!.updated_at;
    const locationHours = await runtimePool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM management_settings_set_location_operating_hours(
         $1,$2,$3,$4::operating_weekday[],$5::boolean[],$6::time[],$7::time[],$8)`,
      [ids.adminMembership, ids.organizationA, ids.locationA, weekdays,
        locationSchedule.closed, locationSchedule.opens, locationSchedule.closes, locationToken],
    );
    await runtimePool.query(
      `SELECT * FROM management_settings_clear_location_operating_hours($1,$2,$3,$4)`,
      [ids.adminMembership, ids.organizationA, ids.locationA, locationHours.rows[0]!.updated_at],
    );
    expect((await adminPool.query(`SELECT count(*)::int AS n FROM organization_operating_hours WHERE organization_id=$1`, [ids.organizationA])).rows[0]?.n).toBe(7);
    const companyAudit = await adminPool.query<{ metadata_json: Record<string, unknown> }>(
      `SELECT metadata_json FROM audit_events WHERE organization_id=$1
         AND event_type='MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED'
         AND metadata_json->>'settingKey'='operatingHours' ORDER BY occurred_at DESC LIMIT 1`,
      [ids.organizationA],
    );
    expect(companyAudit.rows[0]?.metadata_json).toEqual({
      scope: "COMPANY_DEFAULT", settingKey: "operatingHours",
      previousValue: scheduleA.canonical, newValue: scheduleB.canonical,
    });
    const locationAudit = await adminPool.query<{ metadata_json: Record<string, unknown> }>(
      `SELECT metadata_json FROM audit_events WHERE organization_id=$1 AND location_id=$2
         AND event_type='MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED'
         AND metadata_json->>'settingKey'='operatingHours' ORDER BY occurred_at DESC LIMIT 1`,
      [ids.organizationA, ids.locationA],
    );
    expect(locationAudit.rows[0]?.metadata_json).toEqual({
      scope: "LOCATION_OVERRIDE", operation: "CLEAR", settingKey: "operatingHours",
      oldOverridePresent: true, oldOverrideValue: locationSchedule.canonical,
      oldEffectiveValue: locationSchedule.canonical, newOverridePresent: false,
      newEffectiveValue: scheduleB.canonical,
    });
    await expectDenied(runtimePool.query(
      `SELECT * FROM management_settings_set_company_scalar($1,$2,'languageDefault','EN',$3)`,
      [ids.managerMembership, ids.organizationA, new Date()],
    ));
    const foreignToken = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM organizations WHERE id=$1`, [ids.organizationB],
    )).rows[0]!.updated_at;
    await expectDenied(runtimePool.query(
      `SELECT * FROM management_settings_set_company_scalar($1,$2,'languageDefault','AR',$3)`,
      [ids.adminMembership, ids.organizationB, foreignToken],
    ));
  });

  it("keeps Management audit rows append-only", async () => {
    const audits = await adminPool.query<{ id: string; n: number }>(
      `SELECT min(id::text) AS id,count(*)::int AS n FROM audit_events
       WHERE organization_id=$1 AND event_type LIKE 'MANAGEMENT_%'`, [ids.organizationA],
    );
    expect(audits.rows[0]?.n).toBe(5);
    const auditId = audits.rows[0]!.id;
    await expectDenied(runtimePool.query(`UPDATE audit_events SET event_type=event_type WHERE id=$1`, [auditId]));
    await expectDenied(runtimePool.query(`DELETE FROM audit_events WHERE id=$1`, [auditId]));
    await expectDenied(runtimePool.query(`TRUNCATE audit_events`));
  });
});
