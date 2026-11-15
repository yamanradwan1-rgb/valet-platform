import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OptionCAfterFixture, runtimeBoolean } from "./after-fixture";

const fixture = new OptionCAfterFixture();
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

const blockedColumns = [
  ["staff_auth_sessions", "id", "INSERT"],
  ["staff_auth_sessions", "user_id", "INSERT"],
  ["staff_auth_sessions", "current_access_token_hash", "INSERT"],
  ["staff_auth_sessions", "current_access_token_hash", "UPDATE"],
  ["staff_auth_sessions", "revoked_at", "UPDATE"],
  ["staff_auth_sessions", "mfa_authenticated_at", "UPDATE"],
  ["staff_auth_sessions", "mfa_factor_id", "UPDATE"],
  ["staff_auth_sessions", "last_admin_activity_at", "UPDATE"],
  ["staff_refresh_credentials", "token_hash", "INSERT"],
  ["staff_refresh_credentials", "generation", "INSERT"],
  ["staff_refresh_credentials", "consumed_at", "UPDATE"],
  ["staff_refresh_credentials", "replaced_by_credential_id", "UPDATE"],
  ["user_mfa_totp_factors", "user_id", "INSERT"],
  ["user_mfa_totp_factors", "state", "INSERT"],
  ["user_mfa_totp_factors", "state", "UPDATE"],
  ["user_mfa_totp_factors", "last_accepted_step", "UPDATE"],
  ["mfa_recovery_codes", "verifier", "INSERT"],
  ["mfa_recovery_codes", "consumed_at", "UPDATE"],
] as const;

const legacyFunctions = [
  "public.staff_management_set_role(uuid,uuid,uuid,integer,membership_role)",
  "public.staff_management_set_status(uuid,uuid,uuid,integer,membership_status)",
  "public.staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)",
  "public.staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)",
  "public.staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)",
  "public.staff_onboarding_activate(text,text,text)",
] as const;

describe("Option C AFTER / effective runtime SQL privilege closure", () => {
  it("denies every session, refresh, MFA factor and recovery write column", async () => {
    for (const [table, column, privilege] of blockedColumns) {
      const allowed = await runtimeBoolean(
        fixture,
        `SELECT has_column_privilege(current_user, $1, $2, $3) AS allowed`,
        [table, column, privilege],
      );
      expect(allowed, `${table}.${column} ${privilege}`).toBe(false);
    }
    for (const table of [
      "staff_auth_sessions",
      "staff_refresh_credentials",
      "user_mfa_totp_factors",
      "mfa_recovery_codes",
    ]) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        expect(
          await runtimeBoolean(
            fixture,
            `SELECT has_table_privilege(current_user, $1, $2) AS allowed`,
            [table, privilege],
          ),
          `${table} table-level ${privilege}`,
        ).toBe(false);
      }
    }
  });

  it("retires direct/inherited/PUBLIC EXECUTE for actor-UUID management functions", async () => {
    for (const signature of legacyFunctions) {
      const queried = await fixture.runtimeSql(
        `SELECT COALESCE(has_function_privilege(current_user,
                  to_regprocedure($1), 'EXECUTE'),false) AS allowed,
                COALESCE((SELECT bool_or(acl.grantee=0 AND acl.privilege_type='EXECUTE')
                  FROM pg_proc AS fn,
                       LATERAL aclexplode(COALESCE(fn.proacl,
                         acldefault('f',fn.proowner))) AS acl
                  WHERE fn.oid=to_regprocedure($1)),false) AS public_allowed`,
        [signature],
      );
      if (!queried.allowed) throw new Error(`W37 ACL query was denied: ${signature}`);
      expect(queried.result?.allowed, signature).toBe(false);
      expect(queried.result?.public_allowed, `${signature} PUBLIC`).toBe(false);
    }
  });

  it("attests login role has no inherited principal and no dangerous role attributes", async () => {
    const result = await fixture.runtimeSql(
      `SELECT current_user=session_user AS same_principal,
              role.rolcanlogin AS login, role.rolinherit AS inherited,
              role.rolsuper AS superuser, role.rolcreatedb AS createdb,
              role.rolcreaterole AS createrole, role.rolbypassrls AS bypassrls,
              role.rolreplication AS replication,
              EXISTS (SELECT 1 FROM pg_auth_members AS memberships
                      WHERE memberships.member=role.oid) AS has_parent
       FROM pg_roles AS role WHERE role.rolname=current_user`,
    );
    if (!result.allowed) throw new Error("W37 role attestation query was denied.");
    expect(result.result).toMatchObject({
      same_principal: true,
      login: true,
      inherited: false,
      superuser: false,
      createdb: false,
      createrole: false,
      bypassrls: false,
      replication: false,
      has_parent: false,
    });
  });
});
