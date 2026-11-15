import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { test } from "node:test";

import {
  mfaSessionInsertColumns,
  mfaSessionUpdateColumns,
  mfaRefreshUpdateColumns,
} from "./mfa-runtime-privileges.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("S01 source reproduction: an SQL writer can precompute a chosen bearer hash", () => {
  const credentialSource = read(
    "../../../apps/api/src/modules/auth/staff-auth-credential.ts",
  );
  const resolver = read(
    "../../../apps/api/src/modules/auth/staff-session-context.ts",
  );
  const service = read(
    "../../../apps/api/src/modules/auth/staff-auth.service.ts",
  );
  const raw = `vsa1.${"A".repeat(43)}`;
  const digest = `staff-access-sha256:v1:${createHash("sha256")
    .update(raw, "utf8")
    .digest("hex")}`;

  assert.match(credentialSource, /createHash\("sha256"\)/);
  assert.equal(
    digest,
    `staff-access-sha256:v1:${createHash("sha256")
      .update(raw, "utf8")
      .digest("hex")}`,
  );
  assert.match(resolver, /session\.current_access_token_hash = \$1/);
  assert.match(resolver, /staff_user\.status = 'ACTIVE'/);
  assert.match(service, /INSERT INTO staff_auth_sessions/);
  assert.match(service, /INSERT INTO staff_refresh_credentials/);
  assert.match(service, /SET current_access_token_hash = \$1/);
  assert.match(service, /SET consumed_at = \$2::timestamptz/);
});

test("S01 legacy permission contract exactly matches the live direct writer", () => {
  assert.deepEqual(mfaSessionInsertColumns, [
    "id",
    "user_id",
    "current_access_token_hash",
    "access_expires_at",
    "absolute_expires_at",
    "created_at",
    "last_rotated_at",
  ]);
  assert.deepEqual(mfaSessionUpdateColumns, [
    "current_access_token_hash",
    "access_expires_at",
    "revoked_at",
    "last_rotated_at",
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
  ]);
  assert.deepEqual(mfaRefreshUpdateColumns, [
    "consumed_at",
    "replaced_by_credential_id",
  ]);
  const provisioner = read("./mfa-runtime-privileges.mjs");
  const service = read(
    "../../../apps/api/src/modules/auth/staff-auth.service.ts",
  );
  const web = read(
    "../../../apps/api/src/modules/auth/staff-auth.controller.ts",
  );
  const native = read(
    "../../../apps/api/src/modules/auth/native-staff-auth.controller.ts",
  );
  assert.match(
    provisioner,
    /GRANT SELECT, INSERT ON TABLE staff_refresh_credentials TO %I/,
  );
  assert.match(
    provisioner,
    /GRANT UPDATE \(consumed_at, replaced_by_credential_id\)/,
  );
  assert.match(service, /INSERT INTO staff_auth_sessions/);
  assert.match(service, /INSERT INTO staff_refresh_credentials/);
  assert.match(service, /UPDATE staff_refresh_credentials/);
  assert.match(web, /this\.authService\.refresh\(refreshToken\)/);
  assert.match(native, /this\.authService\.refresh\(body\.refreshToken\)/);
});

test("MFA/session and logout writers stay within the explicit compatibility columns", () => {
  const mfaSession = read(
    "../../../apps/api/src/modules/auth/mfa/mfa-session-repository.ts",
  );
  const mfaActivity = read(
    "../../../apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts",
  );
  const revocation = read(
    "../../../apps/api/src/modules/auth/staff-session-revocation.ts",
  );
  assert.match(mfaSession, /SET mfa_authenticated_at = \$3::timestamptz/);
  assert.match(mfaSession, /mfa_factor_id = \$2/);
  assert.match(mfaActivity, /SET last_admin_activity_at = \$4::timestamptz/);
  assert.match(
    revocation,
    /SET revoked_at = COALESCE\(revoked_at, \$2::timestamptz\)/,
  );
  for (const column of [
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
    "revoked_at",
  ])
    assert.ok(mfaSessionUpdateColumns.includes(column));
});

test("A01 stays dormant until an independently approved S01 writer boundary exists", () => {
  const authModule = read("../../../apps/api/src/modules/auth/auth.module.ts");
  const protectedLogin = read(
    "../../../apps/api/src/modules/auth/vap1/issue416-a01-protected-login.ts",
  );
  assert.doesNotMatch(authModule, /Issue416A01ProtectedLogin/);
  assert.match(protectedLogin, /no Nest route\/module registration/i);
  assert.match(
    read("./mfa-runtime-privileges.mjs"),
    /GRANT SELECT, INSERT ON TABLE staff_refresh_credentials/,
  );
});
