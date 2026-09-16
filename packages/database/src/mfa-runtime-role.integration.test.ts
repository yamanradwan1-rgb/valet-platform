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
const databaseName = `valet_mfa_role_${suffix}`;
const runtimeRole = `valet_mfa_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const protectedSecret = `mte1.${"A".repeat(16)}.${"B".repeat(43)}.${"C".repeat(22)}`;
let admin: Pool;
let runtime: Client;
const userId = randomUUID();
const otherUserId = randomUUID();

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

function run(args: string[], migrationUrl: string, runtimeUrl?: string): void {
  execFileSync(process.execPath, args, {
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

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code: "42501" });
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const migrationUrl = scopedUrl();
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  run([prismaCli, "migrate", "deploy"], migrationUrl);
  run(["scripts/provision-runtime-role.mjs"], migrationUrl, runtimeUrl);
  admin = new Pool({ connectionString: migrationUrl });
  runtime = new Client({ connectionString: runtimeUrl });
  await runtime.connect();
  for (const id of [userId, otherUserId]) {
    await admin.query(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES ($1,$2,'test-hash',transaction_timestamp())`,
      [id, `${id}@mfa-runtime.test`],
    );
  }
}, 120_000);

afterAll(async () => {
  await runtime?.end();
  await admin?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("MGT-BE-02 MFA runtime role", () => {
  it("keeps MFA tables PUBLIC-denied and column-scopes runtime writes", async () => {
    const tables = await admin.query<{
      can_insert: boolean;
      can_select: boolean;
      can_update: boolean;
      public_denied: boolean;
      table_name: string;
    }>(
      `SELECT requested.table_name,
              has_table_privilege($1, format('public.%I', requested.table_name),
                                  'SELECT') AS can_select,
              has_table_privilege($1, format('public.%I', requested.table_name),
                                  'INSERT') AS can_insert,
              has_table_privilege($1, format('public.%I', requested.table_name),
                                  'UPDATE') AS can_update,
              NOT EXISTS (
                SELECT 1 FROM pg_class relation
                CROSS JOIN LATERAL aclexplode(
                  COALESCE(relation.relacl, acldefault('r', relation.relowner))
                ) privilege
                WHERE relation.oid=format('public.%I', requested.table_name)::regclass
                  AND privilege.grantee=0
                  AND privilege.privilege_type IN
                    ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
              ) AS public_denied
       FROM unnest(ARRAY['user_mfa_totp_factors','mfa_recovery_codes'])
         AS requested(table_name)
       ORDER BY requested.table_name`,
      [runtimeRole],
    );
    expect(tables.rows).toEqual([
      {
        can_insert: false,
        can_select: true,
        can_update: false,
        public_denied: true,
        table_name: "mfa_recovery_codes",
      },
      {
        can_insert: false,
        can_select: true,
        can_update: false,
        public_denied: true,
        table_name: "user_mfa_totp_factors",
      },
    ]);
    for (const table of ["user_mfa_totp_factors", "mfa_recovery_codes"]) {
      await expectDenied(runtime.query(`DELETE FROM ${table}`));
      await expectDenied(runtime.query(`TRUNCATE ${table}`));
    }
  });
  it("reconciles stale MFA column and guard-function grants", async () => {
    await admin.query(
      `GRANT INSERT (mfa_authenticated_at) ON staff_auth_sessions TO "${runtimeRole}"`,
    );
    await admin.query(
      `GRANT UPDATE (protected_secret) ON user_mfa_totp_factors TO "${runtimeRole}"`,
    );
    await admin.query(
      `GRANT SELECT (verifier) ON mfa_recovery_codes TO PUBLIC`,
    );
    await admin.query(
      `GRANT EXECUTE ON FUNCTION mfa_recovery_code_guard() TO PUBLIC, "${runtimeRole}"`,
    );
    run(
      ["scripts/provision-runtime-role.mjs"],
      scopedUrl(),
      scopedUrl(runtimeRole, runtimePassword),
    );
    const result = await admin.query<{
      public_verifier: boolean;
      runtime_guard: boolean;
      runtime_secret_update: boolean;
      runtime_session_insert: boolean;
    }>(
      `SELECT has_column_privilege($1,'staff_auth_sessions','mfa_authenticated_at','INSERT') AS runtime_session_insert,
              has_column_privilege($1,'user_mfa_totp_factors','protected_secret','UPDATE') AS runtime_secret_update,
              has_function_privilege($1,'mfa_recovery_code_guard()','EXECUTE') AS runtime_guard,
              EXISTS (SELECT 1 FROM information_schema.column_privileges
                      WHERE table_schema='public' AND table_name='mfa_recovery_codes'
                        AND column_name='verifier' AND grantee='PUBLIC') AS public_verifier`,
      [runtimeRole],
    );
    expect(result.rows[0]).toEqual({
      public_verifier: false,
      runtime_guard: false,
      runtime_secret_update: false,
      runtime_session_insert: false,
    });
  });

  it("supports the runtime MFA lifecycle without mutable secret material", async () => {
    const sessionId = randomUUID();
    const factorId = randomUUID();
    await runtime.query(
      `INSERT INTO staff_auth_sessions
         (id,user_id,current_access_token_hash,access_expires_at,
          absolute_expires_at,created_at,last_rotated_at)
       VALUES ($1,$2,$3,transaction_timestamp()+interval '15 minutes',
               transaction_timestamp()+interval '30 days',
               transaction_timestamp(),transaction_timestamp())`,
      [sessionId, userId, `staff-access-sha256:v1:${"a".repeat(64)}`],
    );
    await runtime.query(
      `INSERT INTO user_mfa_totp_factors(id,user_id,state,protected_secret)
       VALUES ($1,$2,'PENDING',$3)`,
      [factorId, userId, protectedSecret],
    );
    await expectDenied(
      runtime.query(
        `UPDATE user_mfa_totp_factors SET protected_secret=$2 WHERE id=$1`,
        [factorId, protectedSecret],
      ),
    );
    await runtime.query(
      `UPDATE user_mfa_totp_factors
       SET state='ACTIVE',activated_at=created_at,
           last_accepted_step=100,recovery_set_generation=1 WHERE id=$1`,
      [factorId],
    );
    const recoveryId = randomUUID();
    await runtime.query(
      `INSERT INTO mfa_recovery_codes
         (id,factor_id,set_generation,slot,selector,verifier)
       VALUES ($1,$2,1,1,'selector001',$3)`,
      [recoveryId, factorId, `mrv1.${"b".repeat(43)}`],
    );
    await expectDenied(
      runtime.query(`UPDATE mfa_recovery_codes SET verifier=$2 WHERE id=$1`, [
        recoveryId,
        `mrv1.${"c".repeat(43)}`,
      ]),
    );
    await runtime.query(
      `UPDATE mfa_recovery_codes SET consumed_at=transaction_timestamp() WHERE id=$1`,
      [recoveryId],
    );
    await expect(
      runtime.query(
        `UPDATE mfa_recovery_codes SET consumed_at=NULL WHERE id=$1`,
        [recoveryId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "mfa_recovery_codes_single_use_check",
    });
    const session = await admin.query<{ created_at: Date }>(
      `SELECT created_at FROM staff_auth_sessions WHERE id=$1`,
      [sessionId],
    );
    const assuranceAt = new Date(session.rows[0]!.created_at.getTime() + 1);
    await runtime.query(
      `UPDATE staff_auth_sessions
       SET mfa_authenticated_at=$2,mfa_factor_id=$3,last_admin_activity_at=$2
       WHERE id=$1`,
      [sessionId, assuranceAt, factorId],
    );
    await expectDenied(
      runtime.query(
        `INSERT INTO staff_auth_sessions
           (id,user_id,current_access_token_hash,access_expires_at,
            absolute_expires_at,created_at,last_rotated_at,
            mfa_authenticated_at,mfa_factor_id,last_admin_activity_at)
         VALUES ($1,$2,$3,transaction_timestamp()+interval '15 minutes',
                 transaction_timestamp()+interval '30 days',transaction_timestamp(),
                 transaction_timestamp(),transaction_timestamp(),$4,
                 transaction_timestamp())`,
        [
          randomUUID(),
          userId,
          `staff-access-sha256:v1:${"d".repeat(64)}`,
          factorId,
        ],
      ),
    );
  });

  it("enforces exact User-factor binding and keeps controlled recovery private", async () => {
    const factorId = randomUUID();
    await runtime.query(
      `INSERT INTO user_mfa_totp_factors(id,user_id,state,protected_secret)
       VALUES ($1,$2,'PENDING',$3)`,
      [factorId, otherUserId, protectedSecret],
    );
    const session = await admin.query<{ created_at: Date; id: string }>(
      `SELECT id::text,created_at FROM staff_auth_sessions WHERE user_id=$1 LIMIT 1`,
      [userId],
    );
    const assuranceAt = new Date(session.rows[0]!.created_at.getTime() + 2);
    await expect(
      runtime.query(
        `UPDATE staff_auth_sessions
         SET mfa_authenticated_at=$2,mfa_factor_id=$3,last_admin_activity_at=$2
         WHERE id=$1`,
        [session.rows[0]!.id, assuranceAt, factorId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "staff_auth_sessions_user_mfa_factor_id_fkey",
    });
    await expectDenied(
      runtime.query(
        `SELECT append_account_security_audit_event(
           $1::uuid,'MFA_CONTROLLED_RECOVERY',NULL,
           'CONTROLLED_OPERATOR'::account_security_actor_type,NULL,'operator:test',
           transaction_timestamp())`,
        [randomUUID()],
      ),
    );
    for (const fn of ["mfa_totp_factor_guard()", "mfa_recovery_code_guard()"]) {
      const result = await admin.query<{ allowed: boolean }>(
        `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`,
        [runtimeRole, `public.${fn}`],
      );
      expect(result.rows[0]?.allowed).toBe(false);
    }
  });
});
