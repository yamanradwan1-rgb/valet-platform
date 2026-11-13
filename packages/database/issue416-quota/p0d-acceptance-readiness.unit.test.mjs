import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Source assertions only. Never import pg, Prisma or W9 tooling here.
function fixture(relative) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const m113 = fixture(
  "../prisma/migrations/20261113011300_issue416_vap1_private_foundation/migration.sql",
);
const m120 = fixture(
  "../prisma/migrations/20261113012000_issue416_vap1_atomic_reset_quota/migration.sql",
);
const m124 = fixture(
  "../prisma/migrations/20261113012400_issue416_vap1_atomic_reset_quota_functions/migration.sql",
);
const antiAbuse = fixture("../../../apps/api/src/modules/anti-abuse/anti-abuse-key.ts");
const acceptance = fixture("./PG17_ACCEPTANCE_NOT_RUN.md");

describe("P0-D source and acceptance-spec readiness — PG17 NOT RUN", () => {
  it("requires a guarded, explicitly NOT RUN acceptance matrix", () => {
    assert.match(acceptance, /SPECIFICATION ONLY.*NO PostgreSQL connection/s);
    assert.match(acceptance, /P3018\/42501/);
    assert.match(acceptance, /exclusive lease/);
    assert.match(acceptance, /BLOCKED \/ PG17 NOT RUN/);
    for (let index = 1; index <= 14; index += 1) {
      const id = String(index).padStart(2, "0");
      assert.ok(acceptance.includes("| Q" + id + " |"), "missing Q" + id);
    }
  });

  it("separates four issuance quotas from two redemption-attempt quotas", () => {
    for (const [scope, cap] of [
      ["issue-target-user", 3], ["issue-issuer-user", 20],
      ["issue-organization", 100], ["issue-client-address", 30],
    ]) {
      assert.ok(m120.includes("'v1:staff-password-reset-" + scope + "'"));
      assert.match(m124, new RegExp(
        "\\('v1:staff-password-reset-" + scope + "', p_[a-z_]+_hash, " + cap + "\\)",
      ));
    }
    assert.match(antiAbuse, /redeemClientAddress: \{\s*scope: "v1:staff-password-reset-redeem-client-address",\s*limit: 30/);
    assert.match(antiAbuse, /redeemCredential: \{\s*scope: "v1:staff-password-reset-redeem-credential",\s*limit: 5/);
    assert.doesNotMatch(m120 + m124, /CREATE (?:TABLE|FUNCTION).*reset_redeem/i);
    assert.doesNotMatch(m124, /v1:staff-password-reset-redeem-/);
  });

  it("documents unresolved private-ID versus old-limiter binding; no closure claim", () => {
    assert.match(m113, /CREATE TABLE auth_proof_private\.limiter_bindings \(/);
    assert.match(m113, /REFERENCES public\.anti_abuse_events\(id\)/);
    assert.match(m120, /CREATE TABLE auth_proof_private\.reset_issue_quota_entries/);
    assert.match(m120, /reservation_id uuid PRIMARY KEY DEFAULT pg_catalog\.gen_random_uuid\(\)/);
    assert.doesNotMatch(m120 + m124, /INSERT INTO auth_proof_private\.limiter_bindings/);
    assert.match(acceptance, /P0 activation blocker — limiter ABI mismatch/);
  });

  it("requires immutable receipt evidence but preserves generation blocker", () => {
    assert.match(m113, /CREATE TABLE auth_proof_private\.operation_receipts/);
    assert.match(m120, /challenge_id uuid NOT NULL UNIQUE/);
    assert.match(m120, /PRIMARY KEY \(audience,operation_id\)/);
    assert.match(m120, /reset_generation bigint/);
    assert.match(m120, /r\.purpose = 'RESET_ISSUE'/);
    assert.match(m120, /c\.consumed_at IS NOT NULL/);
    assert.match(m120, /a\.event_type = 'STAFF_PASSWORD_RESET_LINK_ISSUED'/);
    assert.match(m120, /VAP1_RESET_EVIDENCE_IMMUTABLE/);
    assert.match(m124, /v_evidence\.outcome = 'CHANGED'/);
    assert.match(m124, /r\.outcome = 'LINK_UNAVAILABLE'/);
    assert.match(acceptance, /P0 activation blocker — domain-generation evidence/);
  });

  it("explicitly warns that arbitrary owner DML is not receipt-gated", () => {
    assert.match(m120, /IF TG_TABLE_NAME = 'reset_issue_quota_bundles' THEN/);
    assert.match(m120, /OR OLD\.state <> 'PENDING'\s+OR NEW\.state NOT IN \('COUNTED','IGNORED'\)/);
    assert.match(m120, /IF v_count <> 4 THEN/);
    assert.match(acceptance, /conditional privilege risk — direct owner state transition/);
    assert.match(acceptance, /privileged bypass/);
  });

  it("checks operation-first replay, all-or-none writes and unknown-COMMIT policy", () => {
    const opLock = m124.indexOf("hashtextextended(");
    const reread = m124.indexOf("FOR UPDATE;", opLock);
    const replay = m124.indexOf("VAP1_RESET_QUOTA_OPERATION_CONFLICT", reread);
    const scopeLocks = m124.indexOf('ORDER BY s.scope COLLATE "C"', replay);
    const capCheck = m124.indexOf("VAP1_RESET_QUOTA_EXHAUSTED", scopeLocks);
    const bundle = m124.indexOf("INSERT INTO auth_proof_private.reset_issue_quota_bundles", capCheck);
    const entries = m124.indexOf("INSERT INTO auth_proof_private.reset_issue_quota_entries", bundle);
    assert.ok(opLock >= 0 && opLock < reread && reread < replay);
    assert.ok(replay < scopeLocks && scopeLocks < capCheck);
    assert.ok(capCheck < bundle && bundle < entries);
    assert.match(m120, /DEFERRABLE INITIALLY DEFERRED FOR EACH ROW/);
    assert.match(m124, /ELSIF pg_catalog\.clock_timestamp\(\) >= v_bundle\.reserved_at \+ INTERVAL '15 minutes' THEN\s+v_target := 'COUNTED'/);
    assert.match(m124, /ELSE\s+RETURN 'PENDING';/);
    assert.doesNotMatch(m124, /p_(?:outcome|success|state|counted)\b/);
  });

  it("remains dormant, with no new runtime grants or privileged definer", () => {
    assert.match(m113, /REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC/);
    for (const migration of [m120, m124]) {
      assert.match(migration, /^BEGIN;$/m);
      assert.match(migration, /^SET ROLE vap1_proof_owner;$/m);
      assert.match(migration, /^RESET ROLE;$/m);
      assert.match(migration, /^COMMIT;$/m);
      assert.doesNotMatch(migration, /SECURITY DEFINER/);
      assert.doesNotMatch(migration, /GRANT (?:EXECUTE|USAGE)\b.*\bTO (?:PUBLIC|\w*runtime\w*)/i);
    }
    assert.match(m124, /REVOKE ALL ON FUNCTION auth_proof_private\.reserve_reset_issue_quota/);
    assert.match(m124, /REVOKE ALL ON FUNCTION auth_proof_private\.reconcile_reset_issue_quota/);
  });
});
