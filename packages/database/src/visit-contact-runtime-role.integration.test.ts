import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_mgt_be08_role_${suffix}`;
const runtimeRole = `valet_mgt_be08_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
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
    env: { ...process.env, DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: scopedUrl(), NODE_ENV: "test" },
    stdio: "pipe",
  });
}

async function expectDenied(operation: Promise<unknown>) {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as { code?: string }).code).toBe("42501");
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

describe("MGT-BE-08 Visit Contact runtime privileges", () => {
  it("grants only the two correction commands and keeps helpers private", async () => {
    const result = await adminPool.query<{
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
              NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
                WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE') AS public_denied
       FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
       WHERE namespace.nspname='public' AND function.proname LIKE 'management_visit_contact_%'
       ORDER BY function.proname`,
      [runtimeRole],
    );
    expect(result.rows.map((row) => [row.name, row.runtime_allowed])).toEqual([
      ["management_visit_contact_append_audit", false],
      ["management_visit_contact_authorize_actor", false],
      ["management_visit_contact_correct_name", true],
      ["management_visit_contact_correct_phone", true],
      ["management_visit_contact_guard_audit_event", false],
    ]);
    for (const row of result.rows) {
      expect(row.public_denied).toBe(true);
      expect(row.search_path_safe).toBe(true);
      expect(row.security_definer).toBe(row.name !== "management_visit_contact_guard_audit_event");
    }
  });

  it("denies generic Customer update/delete and Customer/Vehicle delete", async () => {
    const result = await adminPool.query<Record<string, boolean>>(
      `SELECT has_table_privilege($1,'public.customers','UPDATE') AS customer_update,
              has_table_privilege($1,'public.customers','DELETE') AS customer_delete,
              has_table_privilege($1,'public.vehicles','DELETE') AS vehicle_delete`,
      [runtimeRole],
    );
    expect(result.rows[0]).toEqual({
      customer_delete: false,
      customer_update: false,
      vehicle_delete: false,
    });
    await expectDenied(runtimePool.query(`UPDATE customers SET display_name='x' WHERE FALSE`));
    await expectDenied(runtimePool.query(`DELETE FROM customers WHERE FALSE`));
    await expectDenied(runtimePool.query(`DELETE FROM vehicles WHERE FALSE`));
  });

  it("fails closed for invalid direct SQL and prevents forged correction audits", async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const customerId = randomUUID();
    await adminPool.query(`INSERT INTO organizations(id,name,status,timezone,updated_at)
      VALUES($1,'BE08','ACTIVE','Asia/Amman',clock_timestamp())`, [organizationId]);
    await adminPool.query(`INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`, [userId, `${userId}@be08.test`]);
    await adminPool.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
      VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp())`, [membershipId, organizationId, userId]);
    await adminPool.query(`INSERT INTO customers(id,organization_id,phone_normalized,display_name,updated_at)
      VALUES($1,$2,'+962790000001','Safe',clock_timestamp())`, [customerId, organizationId]);
    const before = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM customers WHERE id=$1`, [customerId],
    )).rows[0]!.updated_at;
    const invalid = await runtimePool.query<{ result_code: string }>(
      `SELECT result_code FROM management_visit_contact_correct_phone($1,$2,$3,NULL,$4)`,
      [membershipId, organizationId, customerId, before],
    );
    expect(invalid.rows[0]?.result_code).toBe("CONFIGURATION_VALUE_INVALID");
    await expectDenied(runtimePool.query(
      `INSERT INTO audit_events(id,organization_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1,$2,'SYSTEM','VISIT_CONTACT_NAME_CORRECTED','Customer',$3,'{}',clock_timestamp())`,
      [randomUUID(), organizationId, customerId],
    ));
    expect((await adminPool.query(`SELECT 1 FROM audit_events WHERE organization_id=$1`,
      [organizationId])).rowCount).toBe(0);
  });

  it("rolls back the Customer mutation when atomic audit append fails", async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const customerId = randomUUID();
    await adminPool.query(`INSERT INTO organizations(id,name,status,timezone,updated_at)
      VALUES($1,'Rollback','ACTIVE','Asia/Amman',clock_timestamp())`, [organizationId]);
    await adminPool.query(`INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`, [userId, `${userId}@rollback.test`]);
    await adminPool.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
      VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp())`, [membershipId, organizationId, userId]);
    await adminPool.query(`INSERT INTO customers(id,organization_id,phone_normalized,display_name,updated_at)
      VALUES($1,$2,'+962790000002','Before',clock_timestamp())`, [customerId, organizationId]);
    const before = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM customers WHERE id=$1`, [customerId],
    )).rows[0]!.updated_at;
    await adminPool.query(`CREATE FUNCTION be08_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='VISIT_CONTACT_NAME_CORRECTED' THEN RAISE EXCEPTION 'audit failure'; END IF;
      RETURN NEW; END $$`);
    await adminPool.query(`CREATE TRIGGER be08_fail_audit_trigger BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION be08_fail_audit()`);
    await expect(runtimePool.query(
      `SELECT * FROM management_visit_contact_correct_name($1,$2,$3,'After',$4)`,
      [membershipId, organizationId, customerId, before],
    )).rejects.toThrow("audit failure");
    const customer = await adminPool.query<{ display_name: string }>(
      `SELECT display_name FROM customers WHERE id=$1`, [customerId],
    );
    expect(customer.rows[0]?.display_name).toBe("Before");
    expect((await adminPool.query(`SELECT 1 FROM audit_events WHERE organization_id=$1`,
      [organizationId])).rowCount).toBe(0);
  });
});
