import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(import.meta.url), "../../../../");
const read = (path) => readFileSync(resolve(repo, path), "utf8");
const provisioner = read("packages/database/scripts/provision-runtime-role.mjs");
const grants = read("packages/database/scripts/s04-runtime-privileges.mjs");
const readiness = read("apps/api/src/common/database/runtime-database-readiness.ts");
const limiter = read("apps/api/src/modules/anti-abuse/anti-abuse.service.ts");
const guest = read("apps/api/src/modules/anti-abuse/s04-guest-classified-counter.ts");
const migration = read("packages/database/prisma/migrations/20261115016200_issue416_s04_signed_quota_guard/migration.sql");

test("S04 AFTER: provisioning cannot restore ordinary anti-abuse table writes", () => {
  assert.doesNotMatch(provisioner, /GRANT INSERT .*anti_abuse_events/i);
  assert.doesNotMatch(provisioner, /GRANT UPDATE .*anti_abuse_events/i);
  assert.match(provisioner, /provisionS04RuntimePrivileges/);
  assert.match(grants, /REVOKE INSERT \(scope,key_hash,state,request_class,group_key_hash\)/);
  assert.match(grants, /REVOKE UPDATE \(state,group_key_hash\)/);
  assert.match(grants, /NOT has_any_column_privilege\(\$1,'public.anti_abuse_events','UPDATE'\)/);
  assert.match(grants, /NOT has_any_column_privilege\(\$1,'public.anti_abuse_events','INSERT'\)/);
  assert.match(readiness, /NOT has_any_column_privilege\(current_user,'public.anti_abuse_events','INSERT'\)/);
  assert.match(readiness, /NOT has_any_column_privilege\(current_user,'public.anti_abuse_events','UPDATE'\)/);
});

test("S04 AFTER: runtime cannot insert, discount or rebind without a signed proof", () => {
  assert.doesNotMatch(limiter, /UPDATE anti_abuse_events/);
  assert.doesNotMatch(limiter, /INSERT INTO anti_abuse_events/);
  assert.match(limiter, /public.s04_counted/);
  assert.match(limiter, /public.s04_reserve/);
  assert.match(limiter, /public.s04_finalize/);
  assert.match(guest, /public.s04_guest_classified/);
  assert.doesNotMatch(guest, /UPDATE anti_abuse_events/);
  assert.match(migration, /CREATE TABLE s04_quota_guard.used_nonce/);
  assert.match(migration, /INSERT INTO s04_quota_guard.used_nonce/);
  assert.match(migration, /S04_PROOF_INVALID/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public.s04_guest_classified/);
});

test("S04 AFTER: no SQL signing oracle, action-bound HMAC, bounded nonce retention", () => {
  const signer = read("apps/api/src/modules/anti-abuse/s04-signed-sql-proof.ts");
  const seed = read("packages/database/scripts/provision-s04-proof-key.mjs");
  assert.match(signer, /signS04Counted/);
  assert.match(signer, /signS04Reservation/);
  assert.match(signer, /signS04StaffActivationSuccess/);
  assert.match(signer, /signS04GuestClassified/);
  assert.doesNotMatch(signer, /export function signAction/);
  assert.match(signer, /ANTI_ABUSE_SQL_PROOF_SECRET_B64URL/);
  assert.match(seed, /MIGRATION_DATABASE_URL/);
  assert.match(migration, /p_expires_ms > v_now_ms \+ 30000/);
  assert.match(migration, /CREATE FUNCTION public.s04_cleanup_nonces/);
  assert.match(migration, /interval '1 hour'/);
});

test("S04 AFTER: scoped Staff and MFA success functions have explicit protected grants", () => {
  const writer = read("packages/database/scripts/s04-protected-writer-privileges.mjs");
  assert.match(writer, /public.s04_staff_login_success/);
  assert.match(writer, /staffActivation: "public\.s04_staff_activation_success\(uuid,text,text,text,xid8,uuid,bigint,text\)"/);
  assert.match(writer, /acl\.grantee=0 AND acl\.privilege_type='EXECUTE'/);
  assert.match(writer, /public.s04_mfa_success/);
  assert.match(writer, /REVOKE ALL ON FUNCTION/);
  assert.match(writer, /ordinary_denied/);
  assert.match(migration, /scope='v1:staff-login-identifier'/);
  assert.match(migration, /p_scope NOT IN \('v1:mfa-totp-user','v1:mfa-recovery-user'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public.s04_staff_login_success/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public.s04_mfa_success/);
});
