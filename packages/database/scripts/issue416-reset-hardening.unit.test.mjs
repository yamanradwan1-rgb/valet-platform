import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const base = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');
const read = (name) => readFileSync(join(base, name, 'migration.sql'), 'utf8');
const repaired = '20261113013000_issue416_reset_commit_integrity';

test('reset issuance is two-way deferred: credential cannot commit without its exact changed evidence', () => {
  const sql = read(repaired);
  assert.match(sql, /ALTER TABLE auth_proof_private\.reset_issue_domain_evidence\s+ADD CONSTRAINT\s+issue416_reset_evidence_exact_identity_key\s+UNIQUE\s*\(\s*audience,operation_id,reset_id,reset_generation,audit_event_id,\s*request_fingerprint\s*\)/i);
  assert.match(sql, /ALTER TABLE auth_proof_private\.staff_password_reset_requests\s+ADD CONSTRAINT\s+issue416_reset_credential_requires_evidence_fk\s+FOREIGN KEY\s*\(\s*audience,operation_id,id,generation,issue_audit_event_id,\s*request_fingerprint\s*\)\s*REFERENCES auth_proof_private\.reset_issue_domain_evidence\s*\(\s*audience,operation_id,reset_id,reset_generation,audit_event_id,\s*request_fingerprint\s*\)/i);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/i);
  assert.match(read('20261113012000_issue416_vap1_atomic_reset_quota'), /v_count <> 4/);
});

test('unimplemented R03 writer cannot consume with unrelated same-user receipt or manufactured proof', () => {
  const sql = read(repaired);
  assert.match(sql, /CREATE TRIGGER issue416_reset_redeem_unproven_guard\s+BEFORE INSERT OR UPDATE\s+ON auth_proof_private\.staff_password_reset_requests/i);
  assert.match(sql, /TG_OP = 'INSERT' AND NEW\.consumed_at IS NOT NULL/);
  assert.match(sql, /WHERE consumed_at IS NOT NULL/);
  assert.match(sql, /OLD\.consumed_at IS NULL AND NEW\.consumed_at IS NOT NULL/);
  assert.match(sql, /VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE/);
  assert.doesNotMatch(sql, /GRANT\s+EXECUTE\s+ON/i);
  assert.doesNotMatch(sql, /SECURITY\s+DEFINER/i);
});

test('DB-clock expiry rejects attempted R03 consumption, even before signed-writer activation', () => {
  const sql = read(repaired);
  assert.match(sql, /CREATE FUNCTION auth_proof_private\.enforce_reset_redeem_db_clock\(\)/);
  assert.match(sql, /v_now := pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql, /v_now\s*>=\s*OLD\.expires_at/);
  assert.match(sql, /NEW\.consumed_at := v_now/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER issue416_reset_redeem_expiry_commit/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /pg_catalog\.clock_timestamp\(\)\s*>=\s*NEW\.expires_at/);
  assert.match(sql, /VAP1_RESET_REDEEM_EXPIRED/);
});

test('migration129 keeps existing untrusted bindings inert without failing ADD NOT NULL', () => {
  const sql = read('20261113012900_issue416_a01_limiter_fingerprint');
  assert.match(sql, /ADD COLUMN request_fingerprint bytea\s+CHECK/i);
  assert.doesNotMatch(sql, /ADD COLUMN request_fingerprint bytea NOT NULL/i);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON auth_proof_private\.limiter_bindings/);
  assert.match(sql, /NEW\.request_fingerprint IS NULL/);
  assert.match(sql, /VAP1_A01_UNBOUND_RESERVATION_DENIED/);
});
