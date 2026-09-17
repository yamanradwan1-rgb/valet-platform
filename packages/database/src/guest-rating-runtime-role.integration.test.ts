import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface PgError extends Error { code?: string }
interface RatingRow {
  rated_at: Date | null; rating: number | null; result_code: string;
  valet_session_id: string | null;
}

const adminUrl = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_mgt_be09_role_${suffix}`;
const runtimeRole = `valet_mgt_be09_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const tokens = {
  direct: "D".repeat(43), expired: "E".repeat(43), parked: "P".repeat(43),
  revoked: "R".repeat(43), secondary: "S".repeat(43), valid: "V".repeat(43),
};
let adminPool: Pool;
let runtimePool: Pool;
let organizationId: string;
let locationId: string;
let membershipId: string;
const sessions: Record<keyof typeof tokens, string> = {} as Record<keyof typeof tokens, string>;

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

function tokenHash(raw: string): string {
  return `sha256:v1:${createHash("sha256").update(raw).digest("hex")}`;
}

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try { await operation; throw new Error("Expected PostgreSQL privilege denial."); }
  catch (error) { expect((error as PgError).code).toBe("42501"); }
}

async function seedSession(
  key: keyof typeof tokens,
  options: { expired?: boolean; revoked?: boolean; state?: "COMPLETED" | "PARKED" } = {},
): Promise<void> {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  sessions[key] = sessionId;
  await adminPool.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,clock_timestamp())`, [vehicleId, organizationId, `BE09 ${key}`],
  );
  const state = options.state ?? "COMPLETED";
  await adminPool.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,customer_access_revoked_at,
       organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,completed_at,updated_at)
     VALUES($1,$2,clock_timestamp()+$3::interval,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())`,
    [sessionId, tokenHash(tokens[key]), options.expired ? "-1 hour" : "1 hour",
      options.revoked ? new Date() : null, organizationId, locationId, vehicleId, state,
      membershipId, state === "COMPLETED" ? new Date() : null],
  );
}

async function submit(token: string, rating: number | null): Promise<RatingRow> {
  const result = await runtimePool.query<RatingRow>(
    `SELECT result_code,valet_session_id::text,rating,rated_at FROM guest_rating_submit($1,$2)`,
    [token, rating],
  );
  return result.rows[0]!;
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
  organizationId = randomUUID();
  locationId = randomUUID();
  const userId = randomUUID();
  membershipId = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'BE09 runtime','ACTIVE','Asia/Amman',clock_timestamp())`, [organizationId],
  );
  await adminPool.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,'BE09 runtime','BE09-R','Address','Asia/Amman','JOD',clock_timestamp())`,
    [locationId, organizationId],
  );
  await adminPool.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`, [userId, `${userId}@be09.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [membershipId, organizationId, userId],
  );
  await seedSession("valid");
  await seedSession("secondary");
  await seedSession("parked", { state: "PARKED" });
  await seedSession("expired", { expired: true });
  await seedSession("revoked", { revoked: true });
  await seedSession("direct");
  await adminPool.query(
    `INSERT INTO guest_ratings(organization_id,location_id,valet_session_id,rating)
     VALUES($1,$2,$3,3)`, [organizationId, locationId, sessions.direct],
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

describe("MGT-BE-09 Guest Rating runtime authority", () => {
  it("exposes only the submit SECURITY DEFINER command and keeps helper/PUBLIC closed", async () => {
    const result = await adminPool.query<Record<string, boolean | string>>(
      `SELECT function.proname AS name,
              has_function_privilege($1,function.oid,'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              owner.rolname <> $1 AS owner_safe,
              function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
              NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) p
                WHERE p.grantee=0 AND p.privilege_type='EXECUTE') AS public_denied,
              NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) p
                JOIN pg_roles r ON r.oid=p.grantee WHERE r.rolname=$1 AND p.privilege_type='EXECUTE'
                  AND p.is_grantable) AS grant_option_denied
       FROM pg_proc function JOIN pg_roles owner ON owner.oid=function.proowner
       WHERE function.oid IN (to_regprocedure('public.guest_rating_submit(text,integer)'),
         to_regprocedure('public.guest_rating_reject_mutation()')) ORDER BY function.proname`, [runtimeRole],
    );
    expect(result.rows.map((row) => [row.name, row.runtime_allowed, row.security_definer])).toEqual([
      ["guest_rating_reject_mutation", false, false], ["guest_rating_submit", true, true],
    ]);
    for (const row of result.rows) {
      expect(row.owner_safe).toBe(true);
      expect(row.search_path_safe).toBe(true);
      expect(row.public_denied).toBe(true);
      expect(row.grant_option_denied).toBe(true);
    }
  });

  it("denies every direct runtime table path and all PUBLIC table privileges", async () => {
    const privileges = await adminPool.query<Record<string, boolean>>(
      `SELECT has_table_privilege($1,'guest_ratings','SELECT') AS can_select,
              has_table_privilege($1,'guest_ratings','INSERT') AS can_insert,
              has_table_privilege($1,'guest_ratings','UPDATE') AS can_update,
              has_table_privilege($1,'guest_ratings','DELETE') AS can_delete,
              has_table_privilege($1,'guest_ratings','TRUNCATE') AS can_truncate,
              has_table_privilege($1,'guest_ratings','REFERENCES') AS can_reference,
              has_table_privilege($1,'guest_ratings','TRIGGER') AS can_trigger,
              NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL
                aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) p
                WHERE c.oid='guest_ratings'::regclass AND p.grantee=0) AS public_denied`, [runtimeRole],
    );
    expect(Object.values(privileges.rows[0] ?? {})).toEqual(Array(8).fill(true).map((_, i) => i === 7));
    await expectDenied(runtimePool.query(`SELECT * FROM guest_ratings`));
    await expectDenied(runtimePool.query(
      `INSERT INTO guest_ratings(organization_id,location_id,valet_session_id,rating)
       VALUES($1,$2,$3,2)`, [organizationId, locationId, sessions.secondary],
    ));
    await expectDenied(runtimePool.query(`UPDATE guest_ratings SET rating=4 WHERE valet_session_id=$1`,
      [sessions.direct]));
    await expectDenied(runtimePool.query(`DELETE FROM guest_ratings WHERE valet_session_id=$1`,
      [sessions.direct]));
    await expectDenied(runtimePool.query(`TRUNCATE guest_ratings`));
  });

  it("fails closed for malformed, unknown, expired, revoked, incomplete, and out-of-range submissions", async () => {
    expect(await submit("bad", 3)).toMatchObject({ result_code: "INVALID_ACCESS", valet_session_id: null });
    expect(await submit("U".repeat(43), 3)).toMatchObject({ result_code: "INVALID_ACCESS" });
    expect(await submit(tokens.expired, 3)).toMatchObject({ result_code: "INVALID_ACCESS" });
    expect(await submit(tokens.revoked, 3)).toMatchObject({ result_code: "INVALID_ACCESS" });
    expect(await submit(tokens.parked, 3)).toMatchObject({
      result_code: "NOT_COMPLETED", valet_session_id: sessions.parked,
    });
    for (const rating of [0, 6, null]) {
      expect(await submit(tokens.valid, rating)).toMatchObject({
        result_code: "REQUEST_INVALID", valet_session_id: null,
      });
    }
  });

  it("records one server-timestamped rating, converges exact retries, and rejects divergence", async () => {
    const before = (await adminPool.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0]!.now;
    const first = await submit(tokens.valid, 4);
    const after = (await adminPool.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0]!.now;
    expect(first).toMatchObject({ result_code: "OK", rating: 4, valet_session_id: sessions.valid });
    expect(first.rated_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(first.rated_at!.getTime()).toBeLessThanOrEqual(after.getTime());
    const retry = await submit(tokens.valid, 4);
    expect(retry).toMatchObject({ result_code: "OK", rating: 4, valet_session_id: sessions.valid });
    expect(retry.rated_at?.getTime()).toBe(first.rated_at?.getTime());
    expect(await submit(tokens.valid, 5)).toMatchObject({
      result_code: "CONFLICT", rating: null, valet_session_id: sessions.valid,
    });
    const stored = await adminPool.query<{ n: number; rating: number }>(
      `SELECT count(*)::int AS n,max(rating)::int AS rating FROM guest_ratings WHERE valet_session_id=$1`,
      [sessions.valid],
    );
    expect(stored.rows[0]).toEqual({ n: 1, rating: 4 });
  });

  it("binds the raw bearer to its exact visit", async () => {
    const row = await submit(tokens.secondary, 2);
    expect(row).toMatchObject({ result_code: "OK", rating: 2, valet_session_id: sessions.secondary });
    const stored = await adminPool.query<{ valet_session_id: string }>(
      `SELECT valet_session_id::text FROM guest_ratings WHERE rating=2`,
    );
    expect(stored.rows).toEqual([{ valet_session_id: sessions.secondary }]);
  });
});
