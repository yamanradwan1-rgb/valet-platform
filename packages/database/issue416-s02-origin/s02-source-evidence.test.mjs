// Issue416 Option C / S02: non-DB source evidence, NOT a PostgreSQL exploit.
// This intentionally captures the INSECURE db85db57 baseline before cutover.
// Never interpret PASS as safe MFA authority or actual effective SQL grants.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { provisionMfaPrivileges } from "../scripts/mfa-runtime-privileges.mjs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const role = "issue416_s02_source_only_runtime";

async function captureProvisionerGrants() {
  const formatted = [];
  const statements = [];
  await provisionMfaPrivileges(
    { query: async (sql) => { statements.push(sql); return { rows: [] }; } },
    async (_client, template, args) => {
      formatted.push({ template, args });
    },
    role,
  );
  return { formatted, statements };
}

function hasColumnGrant(formatted, privilege, table, column) {
  return formatted.some(({ template, args }) =>
    template === `GRANT ${privilege} (%I) ON TABLE %I TO %I` &&
    args[0] === column && args[1] === table && args[2] === role
  );
}

test("S02 baseline grants ordinary runtime direct MFA assurance mutation", async () => {
  const { formatted } = await captureProvisionerGrants();
  for (const column of [
    "mfa_authenticated_at", "mfa_factor_id", "last_admin_activity_at",
  ]) {
    assert.equal(
      hasColumnGrant(formatted, "UPDATE", "staff_auth_sessions", column),
      true,
      `Current source grants runtime SQL authority over ${column}`,
    );
  }
});

test("S02 baseline grants runtime factor activation and recovery mutation", async () => {
  const { formatted } = await captureProvisionerGrants();
  for (const column of [
    "state", "activated_at", "last_accepted_step",
    "recovery_set_generation", "retired_at",
  ]) {
    assert.equal(
      hasColumnGrant(formatted, "UPDATE", "user_mfa_totp_factors", column),
      true,
    );
  }
  assert.equal(
    hasColumnGrant(formatted, "INSERT", "user_mfa_totp_factors", "protected_secret"),
    true,
  );
  assert.equal(
    hasColumnGrant(formatted, "INSERT", "mfa_recovery_codes", "verifier"),
    true,
  );
  assert.equal(
    formatted.some(({ template, args }) =>
      template ===
        "GRANT UPDATE (consumed_at) ON TABLE mfa_recovery_codes TO %I" &&
      args[0] === role
    ),
    true,
  );
});

test("S02 same ordinary runtime pool emits MFA writes after Node verification", () => {
  const runtime = source("../../../apps/api/src/common/database/runtime-database.module.ts");
  const stepUp = source("../../../apps/api/src/modules/auth/mfa/mfa-step-up.service.ts");
  const enrollment = source("../../../apps/api/src/modules/auth/mfa/mfa-enrollment.service.ts");
  const recovery = source("../../../apps/api/src/modules/auth/mfa/mfa-recovery.service.ts");
  assert.match(runtime, /createRuntimePostgresPool\(process\.env\.DATABASE_URL\)/);
  for (const ceremony of [stepUp, enrollment, recovery]) {
    assert.match(ceremony, /@Inject\(RUNTIME_POSTGRES_POOL\)/);
    assert.match(ceremony, /establishMfaAssurance\(/);
  }
  assert.match(stepUp, /verifyLockedMfaStepUp\(code, session, factor\)/);
  assert.match(enrollment, /verifyLockedEnrollmentConfirmation\(/);
  assert.match(recovery, /verifyLockedSelfRecoveryCode\(/);
  assert.match(recovery, /verifyLockedRecoveryReissue\(/);
});

test("S02 old runtime role fixture explicitly exercises ceremony-free DML", () => {
  const legacyTest = source("../src/mfa-runtime-role.integration.test.ts");
  assert.match(legacyTest, /await runtime\.query\(\s*`UPDATE user_mfa_totp_factors[\s\S]*?state='ACTIVE'/);
  assert.match(legacyTest, /await runtime\.query\(\s*`UPDATE staff_auth_sessions[\s\S]*?mfa_authenticated_at=\$2/);
  const provisioner = source("../scripts/provision-runtime-role.mjs");
  assert.match(provisioner, /await provisionMfaPrivileges\(client, executeFormatted, runtimeRole\)/);
});
