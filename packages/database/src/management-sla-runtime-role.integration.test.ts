import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface PgError extends Error { code?: string }

const adminUrl = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_mgt_be10_role_${suffix}`;
const runtimeRole = `valet_mgt_be10_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
let adminPool: Pool;
let runtimePool: Pool;
let organizationId: string;
let locationId: string;
let adminMembershipId: string;
let requestId: string;

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

async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  try { await operation; throw new Error(`Expected PostgreSQL error ${code}.`); }
  catch (error) { expect((error as PgError).code).toBe(code); }
}

async function createMembership(role: "LOCATION_MANAGER" | "ORG_ADMIN", organization = organizationId) {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await adminPool.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@be10-role.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
    [membershipId, organization, userId, role],
  );
  return membershipId;
}

async function waitForLockWait(queryFragment: string): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const result = await adminPool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname=current_database() AND state='active'
           AND wait_event_type='Lock' AND query ILIKE $1
       ) AS waiting`,
      [`%${queryFragment}%`],
    );
    if (result.rows[0]?.waiting === true) return;
  }
  throw new Error(`Expected PostgreSQL lock wait for ${queryFragment}.`);
}

async function seedRequestedSession(label: string): Promise<string> {
  const vehicle = randomUUID();
  const session = randomUUID();
  await adminPool.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,clock_timestamp())`, [vehicle, organizationId, label],
  );
  await adminPool.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,organization_id,
       location_id,vehicle_id,state,checked_in_by_membership_id,retrieval_requested_at,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'REQUESTED',$6,
            clock_timestamp(),clock_timestamp())`,
    [session, `disabled:${randomUUID()}`, organizationId, locationId, vehicle, adminMembershipId],
  );
  return session;
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  runScript([prismaCli, "migrate", "deploy"]);
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  adminPool = new Pool({ connectionString: scopedUrl() });
  runtimePool = new Pool({ connectionString: runtimeUrl });
  organizationId = randomUUID();
  locationId = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'BE10 runtime','ACTIVE','Asia/Amman',clock_timestamp())`, [organizationId],
  );
  await adminPool.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,'BE10 runtime','BE10-R','Address','Asia/Amman','JOD',clock_timestamp())`,
    [locationId, organizationId],
  );
  adminMembershipId = await createMembership("ORG_ADMIN");
  const employee = await createMembership("LOCATION_MANAGER");
  const vehicle = randomUUID();
  const session = randomUUID();
  requestId = randomUUID();
  await adminPool.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,'BE10 vehicle',clock_timestamp())`, [vehicle, organizationId],
  );
  await adminPool.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,organization_id,
       location_id,vehicle_id,state,checked_in_by_membership_id,retrieval_requested_at,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'REQUESTED',$6,
            clock_timestamp(),clock_timestamp())`,
    [session, `disabled:${randomUUID()}`, organizationId, locationId, vehicle, employee],
  );
  await adminPool.query(
    `INSERT INTO retrieval_requests(id,organization_id,valet_session_id,requested_by_type,status,requested_at)
     VALUES($1,$2,$3,'CUSTOMER','OPEN',clock_timestamp())`,
    [requestId, organizationId, session],
  );
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("MGT-BE-10 SLA runtime database authority", () => {
  it("grants only reviewed commands and keeps helpers/PUBLIC closed", async () => {
    const names = [
      "public.management_settings_set_location_sla_target(uuid,uuid,uuid,integer,timestamp with time zone)",
      "public.management_settings_clear_location_sla_target(uuid,uuid,uuid,timestamp with time zone)",
      "public.management_settings_append_sla_target_audit(uuid,uuid,uuid,text,text,text)",
      "public.retrieval_request_snapshot_sla_target()",
      "public.retrieval_request_reject_sla_snapshot_mutation()",
    ];
    for (const name of names) {
      const row = (await adminPool.query<Record<string, boolean>>(
        `SELECT has_function_privilege($1,p.oid,'EXECUTE') AS runtime_allowed,
                p.prosecdef AS security_definer,
                owner.rolname<>$1 AS owner_safe,
                p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
                NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
                  WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_denied,
                NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
                  JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname=$1
                    AND a.privilege_type='EXECUTE' AND a.is_grantable) AS grant_option_denied
         FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
         WHERE p.oid=to_regprocedure($2)`, [runtimeRole, name],
      )).rows[0]!;
      expect(row.runtime_allowed).toBe(name.includes("_set_location_sla_") || name.includes("_clear_location_sla_"));
      expect(row.security_definer).toBe(true);
      expect(row.owner_safe).toBe(true);
      expect(row.search_path_safe).toBe(true);
      expect(row.public_denied).toBe(true);
      expect(row.grant_option_denied).toBe(true);
    }
  });

  it("denies generic target mutation and rejects runtime snapshot rewrites", async () => {
    await expectCode(runtimePool.query(
      `UPDATE locations SET sla_target_seconds=300 WHERE id=$1`, [locationId],
    ), "42501");
    await expectCode(runtimePool.query(
      `UPDATE retrieval_requests SET sla_target_seconds_snapshot=300 WHERE id=$1`, [requestId],
    ), "55000");
  });

  it("enforces ORG_ADMIN scope, CAS, exact retry convergence, and typed audit", async () => {
    const location = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id=$1`, [locationId],
    )).rows[0]!;
    const lm = await createMembership("LOCATION_MANAGER");
    await expectCode(runtimePool.query(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,300,$4)`,
      [lm, organizationId, locationId, location.updated_at],
    ), "42501");
    const first = (await runtimePool.query<{ changed: boolean; result_code: string; updated_at: Date }>(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,300,$4)`,
      [adminMembershipId, organizationId, locationId, location.updated_at],
    )).rows[0]!;
    expect(first).toMatchObject({ changed: true, result_code: "OK" });
    const retry = (await runtimePool.query<{ changed: boolean; result_code: string; updated_at: Date }>(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,300,$4)`,
      [adminMembershipId, organizationId, locationId, location.updated_at],
    )).rows[0]!;
    expect(retry).toMatchObject({ changed: false, result_code: "OK" });
    expect(retry.updated_at.getTime()).toBe(first.updated_at.getTime());
    const stale = (await runtimePool.query<{ changed: boolean; result_code: string }>(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,420,$4)`,
      [adminMembershipId, organizationId, locationId, location.updated_at],
    )).rows[0]!;
    expect(stale).toEqual(expect.objectContaining({ changed: false, result_code: "CONFIGURATION_CONFLICT" }));
    const clear = (await runtimePool.query<{ changed: boolean; result_code: string }>(
      `SELECT * FROM management_settings_clear_location_sla_target($1,$2,$3,$4)`,
      [adminMembershipId, organizationId, locationId, first.updated_at],
    )).rows[0]!;
    expect(clear).toMatchObject({ changed: true, result_code: "OK" });
    const audits = await adminPool.query<{ operation: string }>(
      `SELECT metadata_json->>'operation' AS operation FROM audit_events
       WHERE event_type='MANAGEMENT_LOCATION_SLA_TARGET_CHANGED' AND location_id=$1
       ORDER BY occurred_at`, [locationId],
    );
    expect(audits.rows.map((row) => row.operation)).toEqual(["SET", "CLEAR"]);
  });

  it("serializes retrieval snapshots against target changes in both lock orders", async () => {
    const baseRevision = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id=$1`, [locationId],
    )).rows[0]!.updated_at;
    const seeded = (await runtimePool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM management_settings_set_location_sla_target($1,$2,$3,300,$4)`,
      [adminMembershipId, organizationId, locationId, baseRevision],
    )).rows[0]!.updated_at;

    const firstSession = await seedRequestedSession("request-first");
    const requestClient = await adminPool.connect();
    await requestClient.query("BEGIN");
    const firstRequest = randomUUID();
    await requestClient.query(
      `INSERT INTO retrieval_requests(id,organization_id,valet_session_id,requested_by_type,status,requested_at)
       SELECT $1,$2,$3,'CUSTOMER','OPEN',retrieval_requested_at
       FROM valet_sessions WHERE id=$3`,
      [firstRequest, organizationId, firstSession],
    );
    const settingClient = await runtimePool.connect();
    await settingClient.query("BEGIN");
    const pendingSetting = settingClient.query(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,420,$4)`,
      [adminMembershipId, organizationId, locationId, seeded],
    );
    void pendingSetting.catch(() => undefined);
    await waitForLockWait("management_settings_set_location_sla_target");
    await requestClient.query("COMMIT");
    requestClient.release();
    await pendingSetting;
    await settingClient.query("COMMIT");
    settingClient.release();
    expect((await adminPool.query(
      `SELECT sla_target_seconds_snapshot AS value FROM retrieval_requests WHERE id=$1`,
      [firstRequest],
    )).rows[0]?.value).toBe(300);

    const current = (await adminPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM locations WHERE id=$1`, [locationId],
    )).rows[0]!.updated_at;
    const secondSession = await seedRequestedSession("setting-first");
    const targetClient = await runtimePool.connect();
    await targetClient.query("BEGIN");
    await targetClient.query(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,600,$4)`,
      [adminMembershipId, organizationId, locationId, current],
    );
    const secondClient = await adminPool.connect();
    await secondClient.query("BEGIN");
    const secondRequest = randomUUID();
    const pendingRequest = secondClient.query(
      `INSERT INTO retrieval_requests(id,organization_id,valet_session_id,requested_by_type,status,requested_at)
       SELECT $1,$2,$3,'CUSTOMER','OPEN',retrieval_requested_at
       FROM valet_sessions WHERE id=$3`,
      [secondRequest, organizationId, secondSession],
    );
    void pendingRequest.catch(() => undefined);
    await waitForLockWait("INSERT INTO retrieval_requests");
    await targetClient.query("COMMIT");
    targetClient.release();
    await pendingRequest;
    await secondClient.query("COMMIT");
    secondClient.release();
    expect((await adminPool.query(
      `SELECT sla_target_seconds_snapshot AS value FROM retrieval_requests WHERE id=$1`,
      [secondRequest],
    )).rows[0]?.value).toBe(600);
  });
});
