// Architecture contract, not actual PostgreSQL authority attestation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

test("MFA ceremony services use the dedicated protected pool", () => {
  for (const file of [
    "mfa-enrollment.service.ts",
    "mfa-step-up.service.ts",
    "mfa-recovery.service.ts",
    "mfa-state.service.ts",
  ]) {
    const body = source("../../../apps/api/src/modules/auth/mfa/" + file);
    assert.match(body, /@Inject\(MFA_CEREMONY_POSTGRES_POOL\)/);
    assert.doesNotMatch(body, /@Inject\(RUNTIME_POSTGRES_POOL\)/);
    assert.match(body, /inPostgresTransaction\(\s*this\.pool/);
  }
});

test("MFA writer configuration refuses use of same ordinary SQL role", () => {
  const body = source("../../../apps/api/src/common/database/mfa-protected-pool.ts");
  assert.match(body, /MFA_WRITER_DATABASE_URL/);
  assert.match(body, /DATABASE_URL/);
  assert.match(body, /MFA_PROTECTED_WRITER_ENABLED/);
  assert.match(body, /createRuntimePostgresPool/);
});

test("MFA source denies direct runtime grants after protected cutover", () => {
  const body = source("../scripts/mfa-runtime-privileges.mjs");
  assert.match(body, /protectedEnabled/);
  assert.match(body, /!protectedEnabled/);
  const verifier = source("../scripts/mfa-runtime-privilege-verification.mjs");
  assert.match(verifier, /protectedEnabled/);
  assert.match(verifier, /protectedEnabled \? \[\] : mfaFactorUpdateColumns/);
});

test("Management activity stays auth-checked and avoids direct runtime UPDATE", () => {
  const body = source("../../../apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts");
  const protectedTouch = source("../../../apps/api/src/modules/auth/mfa/mfa-protected-admin-touch.ts");
  assert.match(body, /if \(mfaProtectedWriterEnabled\(\)\)/);
  assert.match(protectedTouch, /MFA_ADMIN_ACTIVITY\/v1/);
  assert.match(protectedTouch, /mfa_activity_private\.touch_admin_activity/);
  assert.doesNotMatch(protectedTouch, /registerAfterCommit/);
});
