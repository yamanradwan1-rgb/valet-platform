import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');
const source = (dir) => readFileSync(join(migrations, dir, 'migration.sql'), 'utf8');
const names = [
  '20261113013100_issue416_reset_quota_receipt_finalization',
  '20261113013200_issue416_redeem_exact_identity_evidence',
];

test('R02 terminal discount requires same operation CHANGED or UNCHANGED receipt at COMMIT', () => {
  const sql = source(names[0]);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER issue416_reset_quota_terminal_receipt_guard/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /'DOMAIN_CHANGED'/);
  assert.match(sql, /'DOMAIN_UNCHANGED'/);
  assert.match(sql, /'EXPIRED_UNRESOLVED'/);
  assert.match(sql, /r\.purpose = 'RESET_ISSUE'/);
  assert.match(sql, /r\.challenge_id = e\.challenge_id/);
  assert.match(sql, /r\.payload_digest = c\.payload_digest/);
  assert.match(sql, /r\.state_digest = c\.state_digest/);
  assert.match(sql, /c\.consumed_at IS NOT NULL/);
  assert.match(sql, /c\.actor_session_id IS NOT NULL/);
  assert.match(sql, /e\.request_fingerprint IS DISTINCT FROM b\.request_fingerprint/);
  assert.match(sql, /r\.outcome = 'LINK_UNAVAILABLE'/);
  assert.match(sql, /r\.outcome = 'COMPLETED'/);
  assert.match(sql, /VAP1_RESET_TERMINAL_RECEIPT_DENIED/);
});

test('R02 unresolved expiry is conservative COUNTED, never early IGNORED', () => {
  const sql = source(names[0]);
  assert.match(sql, /LOCK TABLE auth_proof_private\.reset_issue_quota_bundles IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql, /WHERE state <> 'PENDING'/);
  assert.match(sql, /VAP1_RESET_TERMINAL_PREEXISTING_UNVERIFIED/);
  assert.match(sql, /b\.state = 'COUNTED'/);
  assert.match(sql, /b\.finalized_at >= b\.reserved_at \+ INTERVAL '15 minutes'/);
  assert.match(sql, /pg_catalog\.clock_timestamp\(\) >= b\.reserved_at \+ INTERVAL '15 minutes'/);
  assert.match(sql, /NOT EXISTS \(\s*SELECT 1 FROM auth_proof_private\.reset_issue_domain_evidence/);
});

test('R03 evidence binds full credential identity including token digest and redemption receipt', () => {
  const sql = source(names[1]);
  assert.match(sql, /CREATE TABLE auth_proof_private\.reset_redeem_domain_evidence/);
  assert.match(sql, /UNIQUE \(reset_id\)/);
  assert.match(sql, /FOREIGN KEY \(audience,reset_id,reset_generation,token_hash,/);
  assert.match(sql, /FOREIGN KEY \(audience,redeem_operation_id\)/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /o\.purpose = 'RESET_REDEEM'/);
  assert.match(sql, /o\.challenge_id = e\.challenge_id/);
  assert.match(sql, /o\.payload_digest = e\.payload_digest/);
  assert.match(sql, /o\.state_digest = e\.state_digest/);
  assert.match(sql, /c\.actor_kind = 'ANONYMOUS'/);
  assert.match(sql, /a\.event_type = 'STAFF_PASSWORD_RESET_PASSWORD_CHANGED'/);
});

test('R03 consumed rows and evidence require each other; incomplete and expired admissions stay denied', () => {
  const sql = source(names[1]);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER issue416_reset_redeem_evidence_complete/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER issue416_reset_credential_redeem_complete/);
  assert.match(sql, /IF r\.consumed_at IS NULL THEN/);
  assert.match(sql, /r\.consumed_at >= r\.expires_at/);
  assert.match(sql, /VAP1_RESET_REDEEM_EVIDENCE_DENIED/);
  assert.match(sql, /CREATE TRIGGER issue416_reset_redeem_evidence_immutable\s+BEFORE UPDATE OR DELETE/);
  assert.match(sql, /VAP1_RESET_REDEEM_EVIDENCE_IMMUTABLE/);
  const deny = source('20261113013000_issue416_reset_commit_integrity');
  assert.match(deny, /VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE/);
  assert.match(deny, /BEFORE INSERT OR UPDATE/);
  assert.doesNotMatch(sql, /DROP TRIGGER|DISABLE TRIGGER|CREATE OR REPLACE FUNCTION auth_proof_private\.reject_unbound_reset_redemption/i);
});

test('131 and 132 remain dormant owner-only with no public grant or signer oracle', () => {
  for (const name of names) {
    const sql = source(name);
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /SET ROLE vap1_proof_owner;/);
    assert.match(sql, /^COMMIT;\s*$/m);
    assert.doesNotMatch(sql, /SECURITY DEFINER|GRANT\s+EXECUTE|GRANT\s+(?:INSERT|UPDATE|SELECT)\s+ON/i);
    assert.doesNotMatch(sql, /TO\s+(?:PUBLIC|[A-Za-z_]+_runtime)\s*;/i);
  }
});

test('R03 stays denied while public anti-abuse COUNTED rows remain mutable by runtime', () => {
  const databaseDir = join(migrations, '..', '..');
  const provisioner = readFileSync(join(databaseDir, 'scripts', 'provision-runtime-role.mjs'), 'utf8');
  const counter = readFileSync(join(databaseDir, '..', '..', 'apps', 'api', 'src',
    'modules', 'anti-abuse', 'anti-abuse.service.ts'), 'utf8');
  const publicQuotaMayDiscount = /GRANT UPDATE \(state, group_key_hash\) ON TABLE anti_abuse_events TO %I/.test(provisioner)
    && /state IN \('PENDING', 'COUNTED'\)/.test(counter);
  assert.equal(publicQuotaMayDiscount, true, 'verify this legacy source threat before any R03 activation');
  const deny = source('20261113013000_issue416_reset_commit_integrity');
  assert.match(deny, /CREATE TRIGGER issue416_reset_redeem_unproven_guard/);
  assert.match(deny, /VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE/);
  for (const name of names) {
    assert.doesNotMatch(source(name), /DROP TRIGGER|DISABLE TRIGGER|GRANT EXECUTE|SECURITY DEFINER/i);
  }
});
