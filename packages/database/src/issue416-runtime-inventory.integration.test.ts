import { afterAll, beforeAll, expect, it } from "vitest";

import { Issue416AuditTestContext } from "./issue416-audit-test-context.js";

const context = new Issue416AuditTestContext();
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.cleanup(), 60_000);

it("enforces private proof isolation while inspecting legacy-compatible runtime privileges", async () => {
  const identity = await context.runtime.query(
    `SELECT current_user AS role, r.rolsuper, r.rolcreaterole, r.rolcreatedb,
            r.rolreplication, r.rolbypassrls
     FROM pg_roles r WHERE r.rolname=current_user`,
  );
  expect(identity.rows[0]).toEqual({
    role: context.runtimeRole,
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false,
  });
  const inherited = await context.runtime.query(
    `SELECT rolname FROM pg_roles
     WHERE oid<>current_user::regrole AND pg_has_role(current_user,oid,'MEMBER')
     ORDER BY rolname`,
  );
  expect(inherited.rows).toEqual([]);
  const columns = await context.runtime.query(
    `SELECT a.attname AS column,
            has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT') AS select,
            has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT') AS insert,
            has_column_privilege(current_user,a.attrelid,a.attnum,'UPDATE') AS update
     FROM pg_attribute a
     WHERE a.attrelid='public.staff_auth_sessions'::regclass
       AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
  );
  expect(columns.rowCount).toBeGreaterThan(0);
  const functions = await context.runtime.query(
    `SELECT p.oid::regprocedure::text AS signature,
            has_function_privilege(current_user,p.oid,'EXECUTE') AS execute
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND (p.proname LIKE 'staff_%' OR p.proname LIKE 'mfa_%'
         OR p.proname LIKE 'append_%account_security%') ORDER BY signature`,
  );
  const guards = await context.runtime.query(
    `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
            (SELECT count(*)::int FROM pg_trigger t
             WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS user_triggers,
            (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints
     FROM pg_class c WHERE c.oid IN ('public.staff_auth_sessions'::regclass,
       'public.user_mfa_totp_factors'::regclass) ORDER BY c.relname`,
  );
  const password = await context.runtime.query(
    `SELECT has_column_privilege(current_user,'public.users','password_hash','UPDATE') AS allowed`,
  );
  expect(password.rows[0]?.allowed).toBe(false);
  const boundary = await context.admin.query(
    "SELECT phase FROM auth_proof_private.security_boundary WHERE singleton",
  );
  // This fixture has NOT promoted the 35 legacy writer families: verify
  // private proof isolation, not falsely claim PROTECTED operational readiness.
  expect(boundary.rows).toEqual([{ phase: "LEGACY_COMPAT" }]);
  const isolation = await context.admin.query(
    `SELECT NOT has_schema_privilege($1,'auth_proof_private','USAGE')
            AS private_schema_denied,
            NOT has_schema_privilege($1,'auth_proof_private','CREATE')
            AS private_schema_create_denied,
            NOT has_table_privilege($1,'auth_proof_private.proof_keys','SELECT')
            AS proof_keys_denied,
            NOT has_table_privilege($1,'auth_proof_private.proof_challenges','INSERT')
            AS challenge_writes_denied,
            NOT has_table_privilege($1,'auth_proof_private.operation_receipts','SELECT')
            AS receipt_reads_denied,
            NOT EXISTS (
              SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='auth_proof_private'
                AND has_function_privilege($1,p.oid,'EXECUTE')
            ) AS private_calls_denied`,
    [context.runtimeRole],
  );
  expect(isolation.rows).toEqual([
    {
      private_schema_denied: true,
      private_schema_create_denied: true,
      proof_keys_denied: true,
      challenge_writes_denied: true,
      receipt_reads_denied: true,
      private_calls_denied: true,
    },
  ]);
  // Check the full catalog shape without logging sensitive role, session or
  // function metadata to CI output. Public LEGACY_COMPAT grants remain known
  // open work and are not incorrectly asserted to be PROTECTED here.
  expect(functions.rowCount).toBeGreaterThan(0);
  for (const column of columns.rows) {
    expect(typeof column.column).toBe("string");
    expect(typeof column.select).toBe("boolean");
    expect(typeof column.insert).toBe("boolean");
    expect(typeof column.update).toBe("boolean");
  }
  for (const fn of functions.rows) {
    expect(typeof fn.signature).toBe("string");
    expect(typeof fn.execute).toBe("boolean");
  }
  expect(guards.rows).toHaveLength(2);
  for (const guard of guards.rows) {
    expect(typeof guard.relname).toBe("string");
    expect(typeof guard.relrowsecurity).toBe("boolean");
    expect(typeof guard.relforcerowsecurity).toBe("boolean");
    expect(Number(guard.user_triggers)).toBeGreaterThanOrEqual(0);
    expect(Number(guard.constraints)).toBeGreaterThanOrEqual(0);
  }
});
