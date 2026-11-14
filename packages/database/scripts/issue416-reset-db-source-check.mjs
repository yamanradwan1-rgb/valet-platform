import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const databaseDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "20261113012500_issue416_redeem_scope_contract",
  "20261113012600_issue416_private_reset_credentials",
  "20261113012700_issue416_reset_credential_receipt_binding",
  "20261113012800_issue416_reset_private_reservation_abi",
  "20261113012900_issue416_a01_limiter_fingerprint",
  "20261113013000_issue416_reset_commit_integrity",
  "20261113013100_issue416_reset_quota_receipt_finalization",
  "20261113013200_issue416_redeem_exact_identity_evidence",
];

function migration(name) {
  return readFileSync(join(databaseDir, "prisma", "migrations", name, "migration.sql"), "utf8");
}

test("forward-only reset migrations have one transaction and no runtime grants", () => {
  assert.deepEqual([...migrations].sort(), migrations);
  for (const name of migrations) {
    const sql = migration(name);
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /GRANT\s+EXECUTE\s+ON/i);
    assert.doesNotMatch(sql, /TO\s+(?:PUBLIC|[\w]+_runtime)\s*;/i);
    assert.doesNotMatch(sql, /SECURITY\s+DEFINER/i);
  }
});

test("R03 public check extends only approved scopes with predecessor drift guard", () => {
  const source = readFileSync(join(databaseDir, "prisma", "migrations",
    "20261021009800_issue309_photo_view_anti_abuse_scope", "migration.sql"), "utf8");
  const next = migration(migrations[0]);
  const oldValues = [...source.matchAll(/'v1:[a-z0-9-]+'/g)].map(([value]) => value);
  const expected = [...new Set(oldValues)];
  const newValues = [...next.matchAll(/'v1:[a-z0-9-]+'/g)].map(([value]) => value);
  const expectedWithRedeem = [...expected,
    "'v1:staff-password-reset-redeem-client-address'",
    "'v1:staff-password-reset-redeem-credential'"];
  assert.deepEqual([...new Set(newValues)].sort(), expectedWithRedeem.sort());
  assert.match(next, /v_actual IS DISTINCT FROM v_expected/);
  assert.match(next, /LOCK TABLE public\.anti_abuse_events IN ACCESS EXCLUSIVE MODE/);
});

test("reset credential table enforces generation, tenant triple, TTL and lifecycle", () => {
  const sql = migration(migrations[1]);
  assert.equal((sql.match(/REFERENCES public\.organization_memberships\(organization_id,id,user_id\)/g) ?? []).length, 2);
  assert.match(sql, /UNIQUE \(organization_id,operation_id\)/);
  assert.match(sql, /UNIQUE \(target_user_id,generation\)/);
  assert.match(sql, /UNIQUE \(token_hash\)/);
  assert.match(sql, /WHERE consumed_at IS NULL AND revoked_at IS NULL/);
  assert.match(sql, /expires_at = created_at \+ INTERVAL '15 minutes'/);
  assert.match(sql, /NEW\.created_at := pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql, /NEW\.expires_at := NEW\.created_at \+ INTERVAL '15 minutes'/);
  assert.match(sql, /staff-password-reset-sha256:v1:/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /REVOKE ALL ON TABLE auth_proof_private\.staff_password_reset_requests/);
});

test("changed reset evidence must reference actual issued generation and audit", () => {
  const sql = migration(migrations[2]);
  assert.match(sql, /reset_issue_domain_evidence/);
  assert.match(sql, /reset_id,reset_generation,audit_event_id,/);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /r\.purpose = 'RESET_ISSUE'/);
  assert.match(sql, /r\.purpose = 'RESET_REDEEM'/);
  assert.match(sql, /c\.consumed_at IS NOT NULL/g);
  assert.match(sql, /a\.actor_type = 'ANONYMOUS'/);
});

test("R02 private ID ABI cannot accept the legacy public binding row", () => {
  const sql = migration(migrations[3]);
  assert.match(sql, /assert_reset_issue_reservations\(/);
  assert.match(sql, /reset_issue_quota_bundles/);
  assert.match(sql, /reset_issue_quota_entries/);
  assert.doesNotMatch(sql, /FROM public\.anti_abuse_events/i);
  assert.doesNotMatch(sql, /FROM auth_proof_private\.limiter_bindings/i);
  assert.match(sql, /p_reservation_ids\[v_index\]/);
  assert.match(sql, /v_entry\.state IS DISTINCT FROM 'PENDING'/);
  assert.match(sql, /v_bundle\.request_fingerprint IS DISTINCT FROM p_request_fingerprint/);
  assert.match(sql, /FOR SHARE/);
});

test("A01 binding fingerprint is required but cannot mint signing authority", () => {
  const sql = migration(migrations[4]);
  assert.match(sql, /ALTER TABLE auth_proof_private\.limiter_bindings/);
  assert.match(sql, /ADD COLUMN request_fingerprint bytea\s+CHECK/);
  assert.match(sql, /NEW\.request_fingerprint IS NULL/);
  assert.match(sql, /OLD\.request_fingerprint IS NULL/);
  assert.match(sql, /NEW\.request_fingerprint IS DISTINCT FROM OLD\.request_fingerprint/);
  assert.match(sql, /octet_length\(request_fingerprint\) = 32/);
  assert.doesNotMatch(sql, /INSERT INTO|SECURITY DEFINER/i);
});
