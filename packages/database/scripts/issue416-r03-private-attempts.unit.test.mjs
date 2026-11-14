import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sql = (name) =>
  readFileSync(
    join(root, "packages/database/prisma/migrations", name, "migration.sql"),
    "utf8",
  );
const storage = "20261113013300_issue416_r03_private_attempt_ledger";
const gates = "20261113013400_issue416_r03_private_attempt_guards";

test("separate private CLIENT and canonical CREDENTIAL counted ledgers, no public table link", () => {
  const s = sql(storage);
  assert.match(
    s,
    /CREATE TABLE auth_proof_private\.reset_redeem_client_attempts/,
  );
  assert.match(
    s,
    /CREATE TABLE auth_proof_private\.reset_redeem_credential_attempts/,
  );
  assert.match(s, /UNIQUE \(audience,request_id,id\)/);
  assert.match(s, /FOREIGN KEY \(audience,request_id,client_attempt_id\)/);
  assert.match(
    s,
    /REFERENCES auth_proof_private\.reset_redeem_client_attempts/,
  );
  assert.match(s, /CHECK \(key_hash ~\s*'\^anti-abuse-hmac-sha256:v1:/);
  assert.match(s, /\(audience,key_hash,occurred_at\)/);
  assert.doesNotMatch(
    s,
    /public\.anti_abuse_events|raw_ip|raw_token|password_hash|bearer/gi,
  );
  assert.doesNotMatch(s, /\bstate\s+text\b|\bIGNORED\b|DELETE FROM/i);
});

test("database clock, 900s sliding window, 30 client/5 verifier and serialized count", () => {
  const s = sql(gates);
  assert.match(
    s,
    /current_setting\('transaction_isolation'\) <> 'read committed'/,
  );
  assert.match(s, /pg_catalog\.pg_advisory_xact_lock\(/);
  assert.match(s, /pg_catalog\.hashtextextended\(/);
  assert.match(s, /v_now := pg_catalog\.clock_timestamp\(\)/);
  assert.match(s, /NEW\.occurred_at := v_now/);
  assert.match(
    s,
    /NEW\.reservation_xid := pg_catalog\.pg_current_xact_id\(\)::text::numeric/,
  );
  assert.match(s, /WHEN 'reset_redeem_client_attempts' THEN 30/);
  assert.match(s, /WHEN 'reset_redeem_credential_attempts' THEN 5/);
  assert.match(s, /occurred_at > v_now - INTERVAL '15 minutes'/);
  assert.match(s, /occurred_at <= v_now/);
  assert.match(s, /v_count >= v_limit/);
  assert.match(s, /VAP1_R03_ATTEMPT_QUOTA_EXHAUSTED/);
});

test("credential budget needs prior committed client reservation, not same-transaction two-stage bypass", () => {
  const s = sql(gates);
  assert.match(s, /FROM auth_proof_private\.reset_redeem_client_attempts c/);
  assert.match(s, /c\.audience = NEW\.audience/);
  assert.match(s, /c\.request_id = NEW\.request_id/);
  assert.match(s, /c\.id = NEW\.client_attempt_id/);
  assert.match(
    s,
    /v_client_xid =\s*pg_catalog\.pg_current_xact_id\(\)::text::numeric/,
  );
  assert.match(s, /v_client_at <= v_now - INTERVAL '15 minutes'/);
  assert.match(s, /v_client_at > v_now/);
  assert.match(s, /VAP1_R03_CLIENT_LEASE_NOT_COMMITTED/);
  assert.match(s, /BEFORE UPDATE OR DELETE/);
  assert.match(s, /VAP1_R03_ATTEMPT_IMMUTABLE/);
  assert.match(
    s,
    /BEFORE TRUNCATE ON auth_proof_private\.reset_redeem_client_attempts/,
  );
  assert.match(
    s,
    /BEFORE TRUNCATE ON auth_proof_private\.reset_redeem_credential_attempts/,
  );
});

test("source remains fail-closed without genuine pre-parser binder and old runtime ACL retirement", () => {
  const s = sql(gates);
  assert.match(
    s,
    /CREATE FUNCTION auth_proof_private\.deny_unbound_r03_attempt\(\)/,
  );
  assert.match(
    s,
    /BEFORE INSERT ON auth_proof_private\.reset_redeem_client_attempts/,
  );
  assert.match(
    s,
    /BEFORE INSERT ON auth_proof_private\.reset_redeem_credential_attempts/,
  );
  assert.match(s, /VAP1_R03_TRUSTED_BINDER_UNAVAILABLE/);
  assert.match(s, /CREATE TRIGGER issue416_r03_00_client_unbound/);
  assert.match(s, /CREATE TRIGGER issue416_r03_10_client_count/);
  assert.match(s, /CREATE TRIGGER issue416_r03_00_credential_unbound/);
  assert.match(s, /CREATE TRIGGER issue416_r03_10_credential_count/);
  assert.ok(
    s.indexOf("CREATE TRIGGER issue416_r03_00_client_unbound") <
      s.indexOf("CREATE TRIGGER issue416_r03_10_client_count"),
  );
  assert.ok(
    s.indexOf("CREATE TRIGGER issue416_r03_00_credential_unbound") <
      s.indexOf("CREATE TRIGGER issue416_r03_10_credential_count"),
  );
  assert.doesNotMatch(s, /current_setting\('(?:app\.|issue416\.)/i);
  assert.match(
    sql("20261113013000_issue416_reset_commit_integrity"),
    /VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE/,
  );
  for (const name of [storage, gates]) {
    const body = sql(name);
    assert.match(body, /^BEGIN;/m);
    assert.match(body, /^COMMIT;\s*$/m);
    assert.match(body, /SET ROLE vap1_proof_owner;/);
    assert.doesNotMatch(
      body,
      /SECURITY\s+DEFINER|GRANT\s+(?:ALL|EXECUTE|INSERT|UPDATE|DELETE|SELECT|REFERENCES|TRIGGER|USAGE|CREATE)/i,
    );
    assert.doesNotMatch(
      body,
      /DROP TRIGGER|DISABLE TRIGGER|ON CONFLICT DO NOTHING/i,
    );
  }
  const provisioner = readFileSync(
    join(root, "packages/database/scripts/provision-runtime-role.mjs"),
    "utf8",
  );
  assert.match(
    provisioner,
    /GRANT UPDATE \(state, group_key_hash\) ON TABLE anti_abuse_events TO %I/,
  );
});

test("request retry identity cannot create duplicate durable attempts after unknown COMMIT", () => {
  const s = sql(storage);
  assert.equal((s.match(/UNIQUE \(audience,request_id\)/g) ?? []).length, 2);
  assert.equal((s.match(/UNIQUE \(reservation_xid\)/g) ?? []).length, 2);
  assert.match(s, /reservation_xid numeric\(20,0\) NOT NULL/);
  const g = sql(gates);
  assert.match(
    g,
    /NEW\.reservation_xid := pg_catalog\.pg_current_xact_id\(\)::text::numeric/,
  );
  assert.match(g, /NEW\.occurred_at := v_now/);
  assert.match(
    g,
    /AND a\.audience = NEW\.audience|WHERE a\.audience = NEW\.audience/,
  );
  assert.match(
    g,
    /NEW\.audience \|\| ':' \|\| v_scope \|\| ':' \|\| NEW\.key_hash/,
  );
});
