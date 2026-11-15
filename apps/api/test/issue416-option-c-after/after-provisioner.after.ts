import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OptionCAfterFixture, runtimeBoolean } from "./after-fixture";
import { runLegacyRuntimeProvisioner } from "./after-provisioner-runner";

const fixture = new OptionCAfterFixture();
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

const deniedFunctions = [
  "public.staff_management_set_role(uuid,uuid,uuid,integer,membership_role)",
  "public.staff_management_set_status(uuid,uuid,uuid,integer,membership_status)",
  "public.staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)",
  "public.staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)",
  "public.staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)",
  "public.staff_onboarding_activate(text,text,text)",
] as const;

async function closureViolations(): Promise<string[]> {
  const violations: string[] = [];
  for (const [table, column, privilege] of [
    ["staff_auth_sessions", "revoked_at", "UPDATE"],
    ["staff_auth_sessions", "mfa_authenticated_at", "UPDATE"],
    ["staff_auth_sessions", "current_access_token_hash", "INSERT"],
    ["staff_refresh_credentials", "token_hash", "INSERT"],
    ["staff_refresh_credentials", "consumed_at", "UPDATE"],
  ] as const) {
    if (
      await runtimeBoolean(
        fixture,
        `SELECT has_column_privilege(current_user,$1,$2,$3) AS allowed`,
        [table, column, privilege],
      )
    )
      violations.push(`${table}.${column}:${privilege}`);
  }
  for (const fn of deniedFunctions) {
    if (
      await runtimeBoolean(
        fixture,
        `SELECT COALESCE(has_function_privilege(current_user,
           to_regprocedure($1), 'EXECUTE'),false) AS allowed`,
        [fn],
      )
    )
      violations.push(`${fn}:EXECUTE`);
  }
  const ancestry = await fixture.query<{
    parent_count: string;
    inherit: boolean;
  }>(
    `SELECT role.rolinherit AS inherit, count(member.roleid)::text AS parent_count
     FROM pg_roles AS role LEFT JOIN pg_auth_members AS member
       ON member.member=role.oid
     WHERE role.rolname=$1 GROUP BY role.oid,role.rolinherit`,
    [new URL(fixture.runtimeDatabaseUrl()).username],
  );
  if (
    ancestry.rows[0]?.inherit !== false ||
    ancestry.rows[0]?.parent_count !== "0"
  ) {
    violations.push("runtime role membership/inheritance");
  }
  return violations;
}

describe("Option C AFTER / protected legacy-provision fence", () => {
  it("rejects legacy runtime provisioning twice without changing injected ACL state", async () => {
    const parent = `w37_after_parent_${randomBytes(5).toString("hex")}`;
    const principal = new URL(fixture.runtimeDatabaseUrl()).username;
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(principal)) {
      throw new Error("Unsafe W37 runtime principal identifier.");
    }
    const quotedParent = `"${parent}"`;
    const quotedPrincipal = `"${principal}"`;
    let created = false;
    try {
      // This is a malicious membership/grant added ONLY to the disposable
      // synthetic database. Provisioner replay must fully remove it.
      await fixture.query(`CREATE ROLE ${quotedParent} NOLOGIN`);
      created = true;
      await fixture.query(
        `GRANT UPDATE (revoked_at) ON TABLE staff_auth_sessions TO ${quotedParent}`,
      );
      await fixture.query(
        `GRANT ${quotedParent} TO ${quotedPrincipal} WITH INHERIT TRUE`,
      );
      const injected = await fixture.query<{ parent_count: string }>(
        `SELECT count(*)::text AS parent_count FROM pg_auth_members AS membership
         JOIN pg_roles AS parent ON parent.oid=membership.roleid
         JOIN pg_roles AS principal ON principal.oid=membership.member
         WHERE parent.rolname=$1 AND principal.rolname=$2`,
        [parent, principal],
      );
      expect(injected.rows[0]?.parent_count).toBe("1");

      const before = await closureViolations();
      expect(before.length).toBeGreaterThan(0);
      for (let pass = 1; pass <= 2; pass++) {
        const result = await runLegacyRuntimeProvisioner(fixture);
        expect(result.code).not.toBe(0);
        expect(`${result.stdout}\n${result.stderr}`).toContain(
          "Option C PROTECTED",
        );
        const after = await closureViolations();
        expect(
          after,
          `legacy provisioner rejection ${pass} must not mutate ACL state`,
        ).toEqual(before);
      }
    } finally {
      if (created) {
        await fixture
          .query(`REVOKE ${quotedParent} FROM ${quotedPrincipal}`)
          .catch(() => undefined);
        await fixture
          .query(
            `REVOKE UPDATE (revoked_at) ON TABLE staff_auth_sessions FROM ${quotedParent}`,
          )
          .catch(() => undefined);
        await fixture.query(`DROP ROLE ${quotedParent}`).catch(() => undefined);
      }
    }
  }, 90_000);
});
