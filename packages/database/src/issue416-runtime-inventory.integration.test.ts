import { afterAll, beforeAll, expect, it } from "vitest";

import { Issue416AuditTestContext } from "./issue416-audit-test-context.js";

const context = new Issue416AuditTestContext();
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.cleanup(), 60_000);

it("records effective provisioned runtime privileges without changing session state", async () => {
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
  // Catalog facts are evidence of capabilities. They establish no completed
  // impersonation and do not validate the unimplemented reset issuer proof.
  console.info(
    "ISSUE416_RUNTIME_INVENTORY",
    JSON.stringify({
      role: context.runtimeRole,
      inherited: inherited.rows,
      sessionColumns: columns.rows,
      functions: functions.rows,
      guards: guards.rows,
      directPasswordUpdate: password.rows[0]?.allowed,
    }),
  );
});
