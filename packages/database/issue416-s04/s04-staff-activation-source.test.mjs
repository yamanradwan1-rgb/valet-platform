import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(import.meta.url), "../../../../");
const read = (name) => readFileSync(resolve(root, name), "utf8");
function canonicalLf(contents) {
  const remaining = contents.replace(/\r\n/g, "");
  if (remaining.includes("\r") || (contents.includes("\r\n") && remaining.includes("\n"))) {
    throw new Error("S04 migration has mixed or lone-CR line endings.");
  }
  return contents.replace(/\r\n/g, "\n");
}
const migration = canonicalLf(read(
  "packages/database/prisma/migrations/20261115235910_option_c_s04_staff_activation_success/migration.sql",
));
const service = read("apps/api/src/modules/auth/staff-activation.service.ts");
const grants = read("packages/database/scripts/staff-auth-writer-grants.mjs");
const verifier = read("packages/database/scripts/verify-staff-auth-writer-grants.mjs");
const acl = read("packages/database/scripts/option-c-protected-cutover-acl.mjs");

test("activation S04 is a new forward-only migration, not a rewrite", () => {
  assert.throws(() => canonicalLf("first\r\nsecond\n"), /mixed or lone-CR/);
  assert.throws(() => canonicalLf("first\rsecond\n"), /mixed or lone-CR/);
  assert.match(migration, /^-- Option C \/ S04:/);
  assert.match(migration, /\nBEGIN;\n/);
  assert.match(migration, /\nCOMMIT;\s*$/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public.s04_staff_activation_success/);
  assert.doesNotMatch(migration, /\bDROP\b|\bCASCADE\b/);
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
  assert.match(migration, /WHERE id=p_id AND scope=p_scope AND key_hash=p_key AND state='PENDING'/);
  assert.doesNotMatch(migration, /UPDATE public\.users|UPDATE public\.organization_memberships/);
});

test("same verified invite and Argon2 path, same protected transaction, no generic SQL finalizer", () => {
  assert.match(service, /this\.verifier\.verify/);
  assert.match(service, /staffPasswordCreationSchema\.safeParse/);
  assert.match(service, /staffInvitationHash\(body\.inviteToken\)/);
  assert.match(service, /staffAuthWriterTransaction\(this\.writer/);
  assert.match(service, /await activateStaffInvitation\(/);
  assert.match(service, /public\.s04_staff_activation_success/);
  assert.doesNotMatch(service, /public\.s04_finalize/);
  assert.match(service, /await this\.antiAbuse\.finalize\(reservation, "COUNTED"\)/);
});

test("protected writer alone can finalize activation; writer verifiers fence all others", () => {
  assert.match(grants, /"staffActivation", role, runtimeRole/);
  assert.match(verifier, /public\.s04_staff_activation_success\(uuid,text,text,text\)/);
  assert.match(acl, /"public\.s04_staff_activation_success\(uuid,text,text,text\)"/);
  assert.match(acl, /optionCFunctionContract\.staffAuth\[2\]/);
  assert.doesNotMatch(grants, /GRANT EXECUTE ON FUNCTION public\.s04_finalize/);
});
