import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  mfaProtectedWriterFunctions,
  mfaProtectedWriterSessionUpdateColumns,
  mfaProtectedWriterSelectColumns,
  mfaProtectedWriterTables,
  mfaProtectedWriterUserLockColumn,
} from "./mfa-protected-writer-contract.mjs";
import {
  migrationRole,
  mockVerifierClient,
  runtimeRole,
  writerRole,
} from "./mfa-protected-writer-verification-fixture.mjs";
import { verifyMfaProtectedWriterPrivileges } from "./mfa-protected-writer-verification.mjs";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("MFA writer direct SELECT inventory excludes password hashes and anti-abuse rows", () => {
  assert.deepEqual(mfaProtectedWriterSelectColumns.users, ["id", "status"]);
  assert.equal(
    mfaProtectedWriterSelectColumns.users.includes("password_hash"),
    false,
  );
  assert.equal(
    mfaProtectedWriterSelectColumns.staff_auth_sessions.includes(
      "current_access_token_hash",
    ),
    true,
  );
  assert.ok(
    mfaProtectedWriterSelectColumns.staff_auth_sessions.includes("created_at"),
  );
  assert.deepEqual(mfaProtectedWriterSelectColumns.anti_abuse_events, []);
  assert.deepEqual(mfaProtectedWriterSessionUpdateColumns, [
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
  ]);
  assert.equal(mfaProtectedWriterUserLockColumn, "runtime_lock_version");
  assert.deepEqual(mfaProtectedWriterTables, [
    "users",
    "organizations",
    "organization_memberships",
    "staff_auth_sessions",
    "user_mfa_totp_factors",
    "mfa_recovery_codes",
    "anti_abuse_events",
  ]);
});

test("provisioner resets MFA table, column, schema and function grants before exact grants", () => {
  const provisioner = source("./mfa-protected-writer-privileges.mjs");
  const roleProvisioner = source(
    "./mfa-protected-writer-role-provisioning.mjs",
  );
  const grants = source("./mfa-protected-writer-acl-provisioning.mjs");
  assert.match(roleProvisioner, /revokeAllTableColumnPrivileges/);
  assert.match(roleProvisioner, /relation\.relowner=/);
  assert.match(
    roleProvisioner,
    /REVOKE ALL PRIVILEGES ON \$\{kind\} %I\.%I FROM %I/,
  );
  assert.match(
    roleProvisioner,
    /MFA writer has foreign-owned relation authority/,
  );
  assert.match(
    roleProvisioner,
    /MFA writer can execute foreign-owned function/,
  );
  assert.match(
    grants,
    /REVOKE \$\{privilege\} \(%I\) ON TABLE %I\.%I FROM PUBLIC/,
  );
  assert.match(
    grants,
    /GRANT \$\{privilege\} \(%I\) ON TABLE public\.%I TO %I/,
  );
  assert.doesNotMatch(provisioner, /GRANT SELECT ON TABLE %I TO %I/);
  assert.match(
    provisioner,
    /GRANT UPDATE \(\$\{mfaProtectedWriterUserLockColumn\}\) ON TABLE public\.users/,
  );
  assert.doesNotMatch(
    provisioner,
    /GRANT UPDATE \(last_login_at\) ON TABLE public\.users/,
  );
  assert.match(
    roleProvisioner,
    /ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/,
  );
  assert.doesNotMatch(
    roleProvisioner,
    /IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/,
  );
  assert.match(provisioner, /GRANT EXECUTE ON FUNCTION/);
});

test("exact verifier fences table grants, every column, PUBLIC, defaults, memberships and function allowlist", () => {
  const verifier = source("./mfa-protected-writer-verification.mjs");
  const roleVerifier = source("./mfa-protected-writer-role-verification.mjs");
  const functionVerifier = source(
    "./mfa-protected-writer-function-verification.mjs",
  );
  assert.match(verifier, /has_table_privilege/);
  assert.match(verifier, /has_column_privilege/);
  assert.match(verifier, /has_sequence_privilege/);
  assert.match(roleVerifier, /has_database_privilege/);
  assert.match(roleVerifier, /has_schema_privilege/);
  assert.match(verifier, /password_hash/);
  assert.match(roleVerifier, /pg_auth_members/);
  assert.match(roleVerifier, /membership\.admin_option=true/);
  assert.match(roleVerifier, /membership\.set_option=false/);
  assert.match(roleVerifier, /membership\.inherit_option=false/);
  assert.match(roleVerifier, /pg_catalog\.pg_has_role\(\$2,role\.oid,'SET'\)/);
  assert.match(roleVerifier, /pg_default_acl/);
  assert.match(roleVerifier, /defaults\.defaclnamespace=0/);
  assert.match(functionVerifier, /pg_catalog\.aclexplode/);
  assert.match(functionVerifier, /unexpected direct function grant/);
  assert.equal(
    mfaProtectedWriterFunctions.quotaSuccess,
    "public.s04_mfa_success(uuid,text,text)",
  );
  assert.match(
    mfaProtectedWriterFunctions.accountSecurityAudit,
    /append_runtime_account_security_audit_event/,
  );
});

test("exact MFA verifier is exposed for protected cutover readiness integration", () => {
  const verifier = source("./mfa-protected-writer-verification.mjs");
  assert.match(
    verifier,
    /export async function verifyMfaProtectedWriterPrivileges/,
  );
  assert.match(
    verifier,
    /client,\s*runtimeRole,\s*migrationRole,\s*writerRole = optionCRoles\.mfaWriter/,
  );
});

test("exact MFA ACL verifier accepts only its column and SECURITY DEFINER allowlists", async () => {
  await verifyMfaProtectedWriterPrivileges(
    mockVerifierClient(),
    runtimeRole,
    migrationRole,
    writerRole,
  );
});

test("exact MFA ACL verifier rejects password_hash, table, PUBLIC, default and function grants", async () => {
  for (const overrides of [
    { passwordHash: true },
    { tableSelect: true },
    { publicAcl: true },
    { defaults: true },
    { publicFunctionDefaults: true },
    { roleInherit: true },
    { roleMembership: true },
    { migratorSet: true },
    { migratorInherit: true },
    { databaseCreate: true },
    { databaseTemporary: true },
    { publicUsageDenied: true },
    { privateSchemaUsage: true },
    { ownedObject: true },
    { sequencePrivilege: true },
    { functionOwner: "other_owner" },
    { functionPath: "search_path=public" },
    { directFunction: true },
    { exposedDefiner: true },
  ]) {
    await assert.rejects(
      verifyMfaProtectedWriterPrivileges(
        mockVerifierClient(overrides),
        runtimeRole,
        migrationRole,
        writerRole,
      ),
    );
  }
});
