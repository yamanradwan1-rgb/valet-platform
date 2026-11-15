import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const dbRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = (name) => readFileSync(join(
  dbRoot, 'prisma', 'migrations', name, 'migration.sql'), 'utf8');
const old125 = migration('20261113012500_issue416_redeem_scope_contract');
const new135 = '20261113013500_issue416_r03_public_legacy_scope_deny';
const redemptionScopes = [
  'v1:staff-password-reset-redeem-client-address',
  'v1:staff-password-reset-redeem-credential',
];

test('135 rejects both R03 public scopes at the table, not at caller discretion', () => {
  const sql = migration(new135);
  assert.match(sql, /ALTER TABLE public\.anti_abuse_events\s+ADD CONSTRAINT issue416_r03_public_scope_deny/);
  assert.match(sql, /CHECK \(scope NOT IN \(/);
  for (const scope of redemptionScopes) {
    assert.match(sql, new RegExp("'" + scope + "'"));
  }
  assert.match(sql, /VALIDATE CONSTRAINT issue416_r03_public_scope_deny/);
  assert.match(sql, /ALTER TABLE public\.anti_abuse_events[\s\S]*NOT VALID/);
  assert.doesNotMatch(sql, /CREATE (?:OR REPLACE )?FUNCTION|TRIGGER|SECURITY DEFINER|CREATE POLICY/i);
});

test('135 denies historical mutable R03 rows rather than silently clearing them', () => {
  const sql = migration(new135);
  assert.match(sql, /LOCK TABLE public\.anti_abuse_events IN ACCESS EXCLUSIVE MODE/);
  assert.match(sql, /IF EXISTS \(\s*SELECT 1 FROM public\.anti_abuse_events/);
  assert.match(sql, /WHERE scope IN \(/);
  assert.match(sql, /VAP1_R03_PUBLIC_HISTORY_UNVERIFIED/);
  assert.match(sql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(sql, /SET LOCAL statement_timeout = '15s'/);
  assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE|UPDATE public\.anti_abuse_events/i);
});

test('additive constraint keeps all non-R03 Staff/Auth/Guest scopes untouched', () => {
  const sql = migration(new135);
  const previous = [...new Set(
    [...old125.matchAll(/'v1:[a-z0-9-]+'/g)].map(([value]) => value.slice(1, -1)),
  )];
  assert.equal(previous.filter((s) => redemptionScopes.includes(s)).length, 2);
  const denied = [...new Set(
    [...sql.matchAll(/'v1:[a-z0-9-]+'/g)].map(([value]) => value.slice(1, -1)),
  )];
  assert.deepEqual(denied.sort(), redemptionScopes.slice().sort());
  assert.doesNotMatch(sql, /DROP CONSTRAINT anti_abuse_events_scope_check/);
  assert.doesNotMatch(sql,
    /^\s*(?:REVOKE|GRANT|ALTER ROLE|ALTER OWNER|RESET ROLE|SET ROLE)\b/gmi);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;\s*$/m);
});

test('private R03 remains inaccessible; legacy runtime UPDATE cannot restore public scopes', () => {
  const deny130 = migration('20261113013000_issue416_reset_commit_integrity');
  const private134 = migration('20261113013400_issue416_r03_private_attempt_guards');
  const sql = migration(new135);
  assert.match(deny130, /VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE/);
  assert.match(private134, /VAP1_R03_TRUSTED_BINDER_UNAVAILABLE/);
  assert.doesNotMatch(sql, /DROP TRIGGER|ALTER TABLE auth_proof_private|GRANT EXECUTE/);
  const provisioner = readFileSync(join(dbRoot, 'scripts', 'provision-runtime-role.mjs'), 'utf8');
  assert.match(provisioner, /GRANT UPDATE \(state, group_key_hash\) ON TABLE anti_abuse_events/);
  const readiness = readFileSync(join(
    dbRoot, '..', '..', 'apps', 'api', 'src', 'common', 'database',
    'runtime-database-readiness.ts'), 'utf8');
  assert.match(readiness, /anti_abuse_events/);
});
