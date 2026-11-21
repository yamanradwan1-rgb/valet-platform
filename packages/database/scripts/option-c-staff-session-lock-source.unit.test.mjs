import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const source = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const ownerMigration = source(
  "../prisma/migrations/20261116000200_option_c_staff_session_lock_owner/migration.sql",
);
const functionMigration = source(
  "../prisma/migrations/20261116000210_option_c_staff_session_lock_function/migration.sql",
);
const rawBearerMigration = source(
  "../prisma/migrations/20261116000300_option_c_management_raw_bearer_authority/migration.sql",
);
const lockAclContract = source("./option-c-staff-session-lock-contract.mjs");
const lockAclVerification = source(
  "./option-c-staff-session-lock-verification.mjs",
);

test("session lock owner has exact inert mutation and read authority", () => {
  assert.match(
    ownerMigration,
    /ADD COLUMN runtime_lock_version bigint NOT NULL DEFAULT 0/g,
  );
  assert.match(
    ownerMigration,
    /NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE/,
  );
  assert.match(ownerMigration, /NOREPLICATION NOBYPASSRLS/);
  assert.match(
    ownerMigration,
    /GRANT UPDATE \(runtime_lock_version\).*staff_auth_sessions/s,
  );
  assert.match(ownerMigration, /GRANT UPDATE \(runtime_lock_version\).*users/s);
  assert.doesNotMatch(ownerMigration, /GRANT UPDATE \(id\)/);
  assert.doesNotMatch(
    ownerMigration,
    /GRANT SELECT ON TABLE public\.staff_auth_sessions/,
  );
  assert.doesNotMatch(ownerMigration, /password_hash/);
  for (const column of [
    "id",
    "user_id",
    "created_at",
    "current_access_token_hash",
    "revoked_at",
    "access_expires_at",
    "absolute_expires_at",
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
  ])
    assert.match(ownerMigration, new RegExp(`[' ,]${column}[' ,)]`));
});

test("single session definer covers initial and exact bearer modes with canonical locks", () => {
  assert.match(
    functionMigration,
    /CREATE FUNCTION public\.staff_auth_lock_current_session/,
  );
  assert.match(
    functionMigration,
    /p_session_id IS NULL AND p_user_id IS NULL AND p_created_at IS NULL/,
  );
  assert.match(
    functionMigration,
    /p_session_id IS NULL AND p_lock_mode <> 'SHARED'/,
  );
  assert.match(functionMigration, /current_access_token_hash = v_token_hash/);
  assert.match(functionMigration, /session\.user_id = v_effective_user_id/);
  assert.match(
    functionMigration,
    /session\.created_at = v_effective_created_at/,
  );
  assert.match(functionMigration, /session\.revoked_at IS NULL/);
  assert.match(
    functionMigration,
    /clock_timestamp\(\) < session\.access_expires_at/,
  );
  assert.match(
    functionMigration,
    /clock_timestamp\(\) < session\.absolute_expires_at/,
  );
  assert.match(functionMigration, /staff_user\.status = 'ACTIVE'/);
  assert.match(functionMigration, /pg_advisory_xact_lock_shared/);
  assert.match(functionMigration, /pg_advisory_xact_lock\(/);
  assert.doesNotMatch(functionMigration, /SELECT session\.\*/);
  const advisory = functionMigration.indexOf("pg_advisory_xact_lock_shared");
  const userLock = functionMigration.indexOf(
    "FROM public.users AS staff_user",
    advisory,
  );
  const sessionLock = functionMigration.indexOf(
    "FROM public.staff_auth_sessions AS session",
    userLock,
  );
  assert(advisory >= 0 && advisory < userLock && userLock < sessionLock);
  assert.match(functionMigration, /FOR SHARE/);
  assert.match(functionMigration, /FOR UPDATE/);
});

test("Runtime ACL excludes the verifier and all protected session updates", () => {
  const runtimeColumns = lockAclContract.slice(
    lockAclContract.indexOf("runtimeSessionSelectColumns"),
  );
  assert.doesNotMatch(runtimeColumns, /current_access_token_hash/);
  assert.doesNotMatch(runtimeColumns, /runtime_lock_version/);
  assert.match(
    lockAclVerification,
    /assertExactColumns\(client, runtimeRole, "staff_auth_sessions", \{[\s\S]*UPDATE: \[\]/,
  );
  assert.match(
    lockAclVerification,
    /access\.rows\[0\]\?\.allowed !== \(role === runtimeRole\)/,
  );
});

test("Runtime sources use the definer and never read the stored verifier", () => {
  const runtimeSources = [
    "../../../apps/api/src/modules/auth/staff-session-context.ts",
    "../../../apps/api/src/modules/auth/staff-response-user-revalidation.interceptor.ts",
    "../../../apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts",
    "../../../apps/api/src/modules/auth/mfa/mfa-rr-factor-fence.ts",
    "../../../apps/api/src/modules/management/staff-management-authorization.ts",
    "../../../apps/api/src/modules/management/management-visit-contact-authorization.ts",
  ]
    .map(source)
    .join("\n");
  assert.doesNotMatch(
    runtimeSources,
    /current_access_token_hash|accessTokenHash/,
  );
  assert.match(
    source("../../../apps/api/src/modules/auth/staff-session-context.ts"),
    /resolveStaffSessionWithBearer/,
  );
  assert.match(
    source("../../../apps/api/src/modules/auth/staff-session-context.ts"),
    /enumerable:\s*false/,
  );
});

test("Staff Auth post-commit verifier reads stay on the Staff Auth writer", () => {
  const login = source(
    "../../../apps/api/src/modules/auth/staff-auth-login-command.ts",
  );
  const refresh = source(
    "../../../apps/api/src/modules/auth/staff-auth-refresh-command.ts",
  );
  assert.match(login, /const verified = await writer\.query/);
  assert.match(refresh, /const verified = await writer\.query/);
});

test("raw-bearer upgrades preserve only existing Shift Presence entry points", () => {
  const names = [
    ...rawBearerMigration.matchAll(
      /CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(
    names.sort(),
    [
      "shift_presence_lock_management_entitlement",
      "shift_presence_set_policy",
      "staff_shift_force_end",
    ].sort(),
  );
  assert.doesNotMatch(rawBearerMigration, /staff_management_authorized_/);
  assert.match(
    rawBearerMigration,
    /sha256\(pg_catalog\.convert_to\(p_hash,\s*'UTF8'\)\)/,
  );
  assert.match(
    rawBearerMigration,
    /sha256\(pg_catalog\.convert_to\(p_access_hash,'UTF8'\)\)/,
  );
});

test("MFA activity definer now treats its deployed TEXT argument as raw bearer", () => {
  assert.match(functionMigration, /p_access_hash !~ '\^vsa1\[\.\]/);
  assert.match(functionMigration, /v_access_hash:='staff-access-sha256:v1:'/);
  assert.match(
    functionMigration,
    /session\.current_access_token_hash=v_access_hash/,
  );
  assert.match(functionMigration, /\|p_access_hash\|/);
});

test("MFA Writer session lock uses only the advisory boundary plus raw bearer SQL", () => {
  const mfaWriter = source(
    "../../../apps/api/src/modules/auth/mfa/mfa-session-repository.ts",
  );
  assert.match(
    mfaWriter,
    /lockStaffUserSecurityBoundary\(transaction, context\.userId\)/,
  );
  assert.match(
    mfaWriter,
    /sha256\(pg_catalog\.convert_to\(\$3::text, 'UTF8'\)\)/,
  );
  assert.doesNotMatch(mfaWriter, /password_hash/);
});
