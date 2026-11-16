import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(import.meta.url), "../../../../");
const read = (name) => readFileSync(resolve(root, name), "utf8");
function canonicalLf(contents) {
  const remaining = contents.replace(/\r\n/g, "");
  if (
    remaining.includes("\r") ||
    (contents.includes("\r\n") && remaining.includes("\n"))
  ) {
    throw new Error("S04 migration has mixed or lone-CR line endings.");
  }
  return contents.replace(/\r\n/g, "\n");
}
const migration = canonicalLf(
  read(
    "packages/database/prisma/migrations/20261116000100_option_c_s04_signed_staff_activation_success/migration.sql",
  ),
);
const service = read("apps/api/src/modules/auth/staff-activation.service.ts");
const signer = read("apps/api/src/modules/anti-abuse/s04-signed-sql-proof.ts");
const pg17 = read(
  "packages/database/issue416-s04/s04-staff-activation-pg17.integration.mjs",
);
const pg17Support = read(
  "packages/database/issue416-s04/s04-staff-activation-pg17-support.mjs",
);
const pg17Runner = read(
  "packages/database/scripts/run-s04-staff-activation-pg17.mjs",
);
const databasePackage = JSON.parse(read("packages/database/package.json"));
const grants = read("packages/database/scripts/staff-auth-writer-grants.mjs");
const verifier = read(
  "packages/database/scripts/verify-staff-auth-writer-grants.mjs",
);
const acl = read(
  "packages/database/scripts/option-c-protected-cutover-acl.mjs",
);

test("activation S04 is a new forward-only migration, not a rewrite", () => {
  assert.throws(() => canonicalLf("first\r\nsecond\n"), /mixed or lone-CR/);
  assert.throws(() => canonicalLf("first\rsecond\n"), /mixed or lone-CR/);
  assert.match(migration, /^-- Option C \/ S04:/);
  assert.match(migration, /\nBEGIN;\n/);
  assert.match(migration, /\nCOMMIT;\s*$/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog/);
  assert.match(
    migration,
    /DROP FUNCTION public\.s04_staff_activation_success\(uuid,text,text,text\) RESTRICT/,
  );
  assert.match(migration, /p_nonce uuid/);
  assert.match(migration, /p_xid xid8/);
  assert.match(migration, /p_xid <> pg_catalog\.pg_current_xact_id\(\)/);
  assert.match(migration, /p_expires_ms bigint/);
  assert.match(migration, /p_mac text/);
  assert.match(migration, /s04_quota_guard\.require_proof\(/);
  assert.match(migration, /s04-v1\|STAFF_ACTIVATION\|/);
  assert.match(
    migration,
    /p_key\s*\|\|\s*'\|'\s*\|\|\s*p_invitation_hash\s*\|\|\s*'\|'\s*\|\|\s*p_xid\s*\|\|\s*'\|'\s*\|\|\s*p_nonce/,
  );
  assert.doesNotMatch(migration, /GRANT EXECUTE/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public.s04_staff_activation_success/,
  );
  assert.doesNotMatch(migration, /\bDROP\b[^;]*\bCASCADE\b/);
});

test("only exact activation reservations discount, with verified invitation receipt", () => {
  assert.match(migration, /'v1:staff-activation-client-address'/);
  assert.match(migration, /'v1:staff-activation-credential'/);
  assert.match(migration, /invitation\.consumed_at IS NOT NULL/);
  assert.match(migration, /invitation\.revoked_at IS NULL/);
  assert.match(migration, /member\.status='ACTIVE'/);
  assert.match(migration, /account\.status='ACTIVE'/);
  assert.match(migration, /event_type='STAFF_ONBOARDING_ACTIVATED'/);
  assert.match(migration, /audit\.metadata_json->>'generation'/);
  assert.match(
    migration,
    /WHERE id=p_id AND scope=p_scope AND key_hash=p_key AND state='PENDING'/,
  );
  assert.doesNotMatch(
    migration,
    /UPDATE public\.users|UPDATE public\.organization_memberships/,
  );
});

test("same verified invite and Argon2 path, same protected transaction, no generic SQL finalizer", () => {
  assert.match(service, /this\.verifier\.verify/);
  assert.match(service, /staffPasswordCreationSchema\.safeParse/);
  assert.match(service, /staffInvitationHash\(body\.inviteToken\)/);
  assert.match(service, /staffAuthWriterTransaction\(this\.writer/);
  assert.match(service, /await activateStaffInvitation\(/);
  assert.match(service, /signS04StaffActivationSuccess\(/);
  assert.match(service, /pg_catalog\.pg_current_xact_id\(\)::text AS xid/);
  assert.match(service, /public\.s04_staff_activation_success/);
  assert.match(service, /\$5::xid8,\$6::uuid,\$7::bigint,\$8::text/);
  assert.doesNotMatch(service, /public\.s04_finalize/);
  assert.match(
    service,
    /await this\.antiAbuse\.finalize\(reservation, "COUNTED"\)/,
  );
});

test("protected writer alone can finalize activation; writer verifiers fence all others", () => {
  assert.match(grants, /"staffActivation", role, runtimeRole/);
  assert.match(
    verifier,
    /public\.s04_staff_activation_success\(uuid,text,text,text,xid8,uuid,bigint,text\)/,
  );
  assert.match(
    acl,
    /"public\.s04_staff_activation_success\(uuid,text,text,text,xid8,uuid,bigint,text\)"/,
  );
  assert.match(acl, /optionCFunctionContract\.staffAuth\[2\]/);
  assert.doesNotMatch(grants, /GRANT EXECUTE ON FUNCTION public\.s04_finalize/);
  assert.match(signer, /signS04StaffActivationSuccess/);
  assert.match(signer, /STAFF_ACTIVATION/);
  assert.match(signer, /transactionId/);
  assert.doesNotMatch(signer, /export function signAction/);
  assert.match(pg17Support, /signedMigration/);
  assert.match(pg17Support, /proof\("STAFF_ACTIVATION"/);
  assert.match(pg17, /wrongXidMac/);
  assert.match(pg17, /mismatchedXidParameter/);
  assert.match(pg17, /proofFor: events\[0\]/);
  assert.match(pg17, /rollbackProofs/);
  assert.match(
    pg17Support,
    /to_regprocedure\('public\.s04_staff_activation_success\(uuid,text,text,text\)'\)/,
  );
  assert.match(pg17Runner, /S04_W67_PG17_FIXTURE_URL/);
  assert.match(pg17Runner, /S04_W67_PG17_SUPERUSER_URL/);
  assert.match(pg17Runner, /S04_W67_PG17_PORT/);
  assert.match(pg17, /S04_W67_PG17_PORT/);
  assert.equal(
    databasePackage.scripts["s04:staff-activation:pg17"],
    "node scripts/run-s04-staff-activation-pg17.mjs",
  );
});
