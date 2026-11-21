import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Static checks catch accidental contract drift. These are NOT PG17 execution.
const storageSql = readFileSync(new URL(
  "../prisma/migrations/20261113012000_issue416_vap1_atomic_reset_quota/migration.sql",
  import.meta.url,
), "utf8");
const functionsSql = readFileSync(new URL(
  "../prisma/migrations/20261113012400_issue416_vap1_atomic_reset_quota_functions/migration.sql",
  import.meta.url,
), "utf8");
const sql = `${storageSql}\n${functionsSql}`;
const source = readFileSync(new URL(
  "../../../apps/api/src/modules/anti-abuse/anti-abuse-key.ts",
  import.meta.url,
), "utf8");

function section(start) {
  const from = sql.indexOf(`CREATE FUNCTION auth_proof_private.${start}(`);
  assert.ok(from >= 0, `missing ${start}`);
  const to = sql.indexOf("\n$$;", from);
  assert.ok(to > from, `${start} section ends unexpectedly`);
  return sql.slice(from, to + "\n$$;".length);
}

const reserve = section("reserve_reset_issue_quota");
const reconcile = section("reconcile_reset_issue_quota");

const issuePolicies = [
  ["target-user", "target", 3, "issueTargetUser"],
  ["issuer-user", "issuer", 20, "issueIssuerUser"],
  ["organization", "organization", 100, "issueOrganization"],
  ["client-address", "client_address", 30, "issueClientAddress"],
];

function exactQuotas(text) {
  return [...text.matchAll(/\('v1:staff-password-reset-issue-([^']+)',\s*p_(\w+)_hash,\s*(\d+)\)/g)]
    .map(([, scope, key, cap]) => [scope, key, Number(cap)]);
}

describe("R02 source-only 4-scope protected quota contract", () => {
  it("splits into two individually atomic migrations under 300 physical lines", () => {
    for (const [body, label] of [
      [storageSql, "120"], [functionsSql, "124"],
    ]) {
      const lineCount = body.trimEnd().split(/\r?\n/).length;
      assert.ok(lineCount <= 300, `migration${label} has ${lineCount} lines`);
      assert.equal((body.match(/^BEGIN;$/gm) ?? []).length, 1);
      assert.equal((body.match(/^COMMIT;$/gm) ?? []).length, 1);
      assert.equal((body.match(/^SET ROLE vap1_proof_owner;$/gm) ?? []).length, 1);
      assert.equal((body.match(/^RESET ROLE;$/gm) ?? []).length, 1);
      assert.ok(body.indexOf("BEGIN;") < body.indexOf("SET ROLE vap1_proof_owner;"));
      assert.ok(body.indexOf("RESET ROLE;") < body.lastIndexOf("COMMIT;"));
    }
    assert.match(storageSql, /CREATE TABLE auth_proof_private\.reset_issue_quota_bundles/);
    assert.match(storageSql, /CREATE TABLE auth_proof_private\.reset_issue_domain_evidence/);
    assert.match(storageSql, /CREATE TRIGGER vap1_reset_evidence_source_guard/);
    assert.doesNotMatch(storageSql, /CREATE FUNCTION auth_proof_private\.reserve_reset_issue_quota\(/);
    assert.doesNotMatch(storageSql, /CREATE FUNCTION auth_proof_private\.reconcile_reset_issue_quota\(/);
    assert.match(functionsSql, /CREATE FUNCTION auth_proof_private\.reserve_reset_issue_quota\(/);
    assert.match(functionsSql, /CREATE FUNCTION auth_proof_private\.reconcile_reset_issue_quota\(/);
    assert.doesNotMatch(functionsSql, /CREATE (?:TABLE|TRIGGER|CONSTRAINT TRIGGER) /);
  });

  it("extracts the third hash component as the exact 32-byte HMAC digest", () => {
    const digest = "ab".repeat(32);
    const keyHash = `anti-abuse-hmac-sha256:v1:${digest}`;
    assert.deepEqual(keyHash.split(":"), ["anti-abuse-hmac-sha256", "v1", digest]);
    assert.equal(Buffer.from(keyHash.split(":")[2], "hex").length, 32);
    assert.match(storageSql, /pg_catalog\.split_part\(key_hash, ':', 3\)/);
    assert.match(functionsSql, /pg_catalog\.split_part\(v_key\.key_hash, ':', 3\)/);
    assert.doesNotMatch(sql, /split_part\((?:v_key\.)?key_hash, ':', [12]\)/);
  });

  it("uses precisely the W4 scopes/rolling caps in both lock and count passes", () => {
    const expected = issuePolicies.map(([scope, key, cap]) => [scope, key, cap]);
    assert.deepEqual(exactQuotas(reserve), [...expected, ...expected]);
    for (const [scope, , cap, policy] of issuePolicies) {
      const pattern = new RegExp(
        `${policy}: \\{\\s*scope: "v1:staff-password-reset-issue-${scope}",\\s*limit: ${cap},`,
      );
      assert.match(source, pattern);
    }
    assert.notDeepEqual(exactQuotas(reserve.replace("p_target_hash, 3", "p_target_hash, 4")),
      [...expected, ...expected]);
  });

  it("locks immutable operation before sorted logical keys and only then counts", () => {
    const opLock = reserve.indexOf("hashtextextended(");
    const perKeyLock = reserve.indexOf("pg_advisory_xact_lock(", opLock + 1);
    const logicalOrder = reserve.indexOf('ORDER BY s.scope COLLATE "C"');
    const decisionTime = reserve.indexOf("v_now := pg_catalog.clock_timestamp()");
    const count = reserve.indexOf("SELECT pg_catalog.count(*) INTO v_count");
    const insert = reserve.indexOf("INSERT INTO auth_proof_private.reset_issue_quota_bundles");
    assert.ok(opLock > 0 && logicalOrder < perKeyLock);
    assert.ok(perKeyLock < decisionTime && decisionTime < count && count < insert);
    assert.match(reserve, /v_existing\.request_fingerprint[\s\S]+VAP1_RESET_QUOTA_OPERATION_CONFLICT/);
  });

  it("creates an all-or-none private four-row PENDING bundle", () => {
    const entries = reserve.slice(reserve.indexOf(
      "INSERT INTO auth_proof_private.reset_issue_quota_entries",
    ));
    for (const [scope] of issuePolicies) {
      assert.ok(entries.includes(`'v1:staff-password-reset-issue-${scope}'`));
    }
    assert.match(sql, /UNIQUE \(audience,operation_id,scope\)/);
    assert.match(sql, /key_digest bytea GENERATED ALWAYS AS/);
    assert.match(sql, /audit_event_id uuid REFERENCES public\.account_security_audit_events/);
    assert.match(sql, /WHERE state IN \('PENDING','COUNTED'\)/);
    assert.match(reserve, /VAP1_RESET_QUOTA_EXHAUSTED/);
    assert.match(reserve, /e\.occurred_at > v_now - INTERVAL '15 minutes'/);
    assert.match(sql, /CREATE INDEX vap1_reset_issue_quota_rolling_window/);
    assert.match(sql, /CREATE CONSTRAINT TRIGGER vap1_reset_bundle_integrity/);
    assert.match(sql, /CREATE CONSTRAINT TRIGGER vap1_reset_entry_integrity/);
    assert.match(sql, /DEFERRABLE INITIALLY DEFERRED FOR EACH ROW/);
  });

  it("accepts only immutable signed domain evidence and never caller state", () => {
    const evidence = section("validate_reset_issue_domain_evidence");
    assert.match(evidence, /r\.purpose = 'RESET_ISSUE'/);
    assert.match(evidence, /c\.consumed_at IS NOT NULL/);
    assert.match(evidence, /c\.membership_id = v_bundle\.issuer_membership_id/);
    assert.match(evidence, /a\.event_type = 'STAFF_PASSWORD_RESET_LINK_ISSUED'/);
    assert.match(sql, /VAP1_RESET_EVIDENCE_IMMUTABLE/);
    assert.match(reconcile, /reconcile_reset_issue_quota\(\s*p_audience text, p_operation_id uuid/);
    assert.doesNotMatch(reconcile, /p_(?:state|outcome|success|counted)\b/);
    assert.match(reconcile, /v_evidence\.outcome = 'CHANGED'/);
    assert.match(reconcile, /v_target := 'COUNTED';\s*v_basis := 'EXPIRED_UNRESOLVED'/);
    assert.match(reconcile, /IF v_rows <> 4 THEN/);
    assert.match(reconcile, /ELSE\s*RETURN 'PENDING';/);
  });

  it("exposes no SQL runtime capability or unrelated public-redeem writer", () => {
    assert.match(sql, /SET ROLE vap1_proof_owner;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION auth_proof_private\.reserve_reset_issue_quota\(/);
    assert.match(sql, /REVOKE ALL ON FUNCTION auth_proof_private\.reconcile_reset_issue_quota\(/);
    assert.doesNotMatch(sql, /\bGRANT (?:EXECUTE|USAGE)\b[\s\S]*\bTO (?:PUBLIC|\w*runtime\w*)\b/i);
    assert.doesNotMatch(sql, /\bSECURITY DEFINER\b[\s\S]*AS \$\$/);
    assert.doesNotMatch(sql, /CREATE FUNCTION .*redeem/i);
    assert.match(source, /redeemClientAddress: \{\s*scope: "v1:staff-password-reset-redeem-client-address",\s*limit: 30/);
    assert.match(source, /redeemCredential: \{\s*scope: "v1:staff-password-reset-redeem-credential",\s*limit: 5/);
  });
});
