import assert from "node:assert/strict";
import test from "node:test";
import {
  executeControlledRecovery, planControlledTransition,
} from "../controlled-transition.mjs";
import {
  reconcileOlderBackup, REQUIRED_MONOTONE_DIMENSIONS,
} from "../older-backup-fence.mjs";
import { DIGEST, KEY, NOW, TRUST, fixtureCase } from "./synthetic-fixture.mjs";
import { admissionKey, admissionKeyId } from "../typed-admission-key.mjs";
import { USER } from "./synthetic-fixture.mjs";

const current = { key: KEY, disposition: "ADMIT", admissionVersion: 3,
  materialDigest: DIGEST };
function caseFor(from, to, overrides = {}) {
  return fixtureCase({
    from, to, purpose: "L1_" + to, expectedAdmissionVersion: 3,
    ...overrides,
  });
}
function ledger(disposition = "HOLD", overrides = {}) {
  return {
    attested: true, keyId: admissionKeyId(KEY), caseId: "synthetic-case-001",
    disposition, version: 4, ...overrides,
  };
}

test("controlled HOLD requires correctly signed independent approvals", () => {
  const plan = planControlledTransition({
    current, envelope: caseFor("ADMIT", "HOLD"),
    trustedKeys: TRUST, checkpoint: ledger(), nowMs: NOW,
  });
  assert.equal(plan.status, "OFFLINE_REVIEW_PLAN_NOT_AUTHORIZATION");
  assert.equal(plan.preElectedMode, "FOR UPDATE");
  assert.equal(plan.nextAdmissionVersion, 4);
  assert.ok(plan.requires.includes("W2_PROTECTED_SQL_CAS"));
});

test("old-case version, material mismatch and missing checkpoint all deny", () => {
  const good = caseFor("ADMIT", "HOLD");
  const args = { current, envelope: good, trustedKeys: TRUST,
    checkpoint: ledger(), nowMs: NOW };
  assert.throws(() => planControlledTransition({ ...args,
    checkpoint: null }), /L1_MONOTONE_CHECKPOINT_REQUIRED/);
  assert.throws(() => planControlledTransition({ ...args,
    current: { ...current, admissionVersion: 4 } }),
  /L1_STALE_ADMISSION_CAS/);
  assert.throws(() => planControlledTransition({ ...args,
    current: { ...current, materialDigest: "cd".repeat(32) } }),
  /L1_STALE_ADMISSION_CAS/);
});

test("unverified or mismatched deny intent cannot authorize HOLD", () => {
  const args = { current, envelope: caseFor("ADMIT", "HOLD"),
    trustedKeys: TRUST, nowMs: NOW };
  assert.throws(() => planControlledTransition({ ...args,
    checkpoint: ledger("ADMIT") }), /L1_PENDING_DENY_INTENT_REQUIRED/);
  assert.throws(() => planControlledTransition({ ...args,
    checkpoint: ledger("HOLD", { version: 3 }) }),
  /L1_MONOTONE_CHECKPOINT_REQUIRED/);
  assert.throws(() => planControlledTransition({ ...args,
    checkpoint: ledger("HOLD", { attested: false }) }),
  /L1_MONOTONE_CHECKPOINT_REQUIRED/);
  assert.throws(() => planControlledTransition({ ...args,
    checkpoint: ledger("RETIRE") }), /L1_PENDING_DENY_INTENT_REQUIRED/);
  const retiring = { ...args, envelope: caseFor("ADMIT", "RETIRE") };
  assert.throws(() => planControlledTransition({ ...retiring,
    checkpoint: ledger("HOLD") }), /L1_PENDING_DENY_INTENT_REQUIRED/);
});

test("RETIRE is terminal; later ADMIT needs an independent new case", () => {
  const retired = { ...current, disposition: "RETIRE" };
  assert.throws(() => planControlledTransition({
    current: retired, envelope: caseFor("HOLD", "ADMIT"),
    trustedKeys: TRUST, checkpoint: ledger("ADMIT"), nowMs: NOW,
  }), /L1_STALE_ADMISSION_CAS|L1_INVALID_TRANSITION/);
  const held = { ...current, disposition: "HOLD" };
  assert.throws(() => planControlledTransition({
    current: held, envelope: caseFor("HOLD", "ADMIT"),
    trustedKeys: TRUST, checkpoint: ledger("ADMIT"), nowMs: NOW,
  }), /L1_NEW_ALLOW_AUTHORITY_REQUIRED/);
  const admission = planControlledTransition({
    current: held, envelope: caseFor("HOLD", "ADMIT"),
    trustedKeys: TRUST, checkpoint: ledger("ADMIT", {
      priorDispositionsVerified: true,
    }), nowMs: NOW,
  });
  assert.equal(admission.to, "ADMIT");
  assert.equal(admission.status, "OFFLINE_REVIEW_PLAN_NOT_AUTHORIZATION");
});

test("signed HOLD to ADMIT cannot revive pre-T0 session, refresh or push authority", () => {
  for (const kind of ["SESSION", "REFRESH", "PUSH_REGISTRATION"]) {
    const key = admissionKey({ audience: KEY.audience, kind, ids: [USER] });
    const candidate = { ...current, key, disposition: "HOLD" };
    const proof = caseFor("HOLD", "ADMIT", { key });
    const checkpoint = ledger("ADMIT", {
      keyId: admissionKeyId(key), priorDispositionsVerified: true,
    });
    assert.throws(() => planControlledTransition({
      current: candidate, envelope: proof, trustedKeys: TRUST,
      checkpoint, nowMs: NOW,
    }), /L1_LEGACY_AUTHORITY_ADMIT_FORBIDDEN/, kind);
    const denyPlan = planControlledTransition({
      current: { ...candidate, disposition: "ADMIT" },
      envelope: caseFor("ADMIT", "HOLD", { key }),
      trustedKeys: TRUST, checkpoint: ledger("HOLD", {
        keyId: admissionKeyId(key),
      }), nowMs: NOW,
    });
    assert.equal(denyPlan.to, "HOLD", kind);
    assert.equal(denyPlan.status, "OFFLINE_REVIEW_PLAN_NOT_AUTHORIZATION");
  }
});

test("the real recovery execution API always refuses", () => {
  assert.throws(() => executeControlledRecovery({
    operatorRef: "fake-authority",
  }), /L1_RECOVERY_NOT_CONNECTED_FAIL_CLOSED/);
});

test("old snapshot ADMIT with later HOLD remains HOLD", () => {
  const snapshot = [{ key: KEY, disposition: "ADMIT",
    admissionVersion: 3, boundaryEpoch: 8 }];
  const restored = reconcileOlderBackup(snapshot, {
    independentlyVerified: true, completeThroughBackupBoundary: true,
    epoch: 8, objects: [{ key: KEY, version: 4,
      disposition: "HOLD", epoch: 8 }],
  });
  assert.equal(restored.objects[0].disposition, "HOLD");
  assert.equal(restored.mustKeepProtectedTrafficClosed, true);
});

test("missing ledger and outstanding deny intent never revive ADMIT", () => {
  const snapshot = [{ key: KEY, disposition: "ADMIT",
    admissionVersion: 4, boundaryEpoch: 8 }];
  assert.equal(reconcileOlderBackup(snapshot, null).objects[0].disposition,
    "HOLD");
  const pending = reconcileOlderBackup(snapshot, {
    independentlyVerified: true, completeThroughBackupBoundary: true,
    epoch: 8, objects: [{ key: KEY, version: 4,
      disposition: "ADMIT", epoch: 8, pendingDeny: true }],
  });
  assert.equal(pending.objects[0].disposition, "HOLD");
});

test("complete matching synthetic versions still cannot release HOLD", () => {
  const snapshot = [{ key: KEY, disposition: "ADMIT",
    admissionVersion: 4, boundaryEpoch: 8 }];
  const restored = reconcileOlderBackup(snapshot, {
    independentlyVerified: true, completeThroughBackupBoundary: true,
    coveredDimensions: Object.fromEntries(
      REQUIRED_MONOTONE_DIMENSIONS.map((name) => [name, true])),
    epoch: 8, objects: [{ key: KEY, version: 4,
      disposition: "ADMIT", epoch: 8, pendingDeny: false }],
  });
  assert.equal(restored.objects[0].disposition, "HOLD");
  assert.equal(restored.objects[0].suppliedFixtureVersionMatchOnly,
    true);
  assert.equal(restored.missingMonotoneDimensions.length, 0);
  assert.equal(restored.mustKeepProtectedTrafficClosed, true);
  assert.equal(restored.status, "ISOLATED_RESTORE_PLAN_NOT_AUTHORIZATION");
  // A caller-provided JSON checkpoint is never a trusted production attestation.
});

test("missing pending-deny statement cannot qualify an old ADMIT as matched", () => {
  const restored = [{ key: KEY, disposition: "ADMIT",
    admissionVersion: 4, boundaryEpoch: 8 }];
  const base = {
    independentlyVerified: true, completeThroughBackupBoundary: true,
    coveredDimensions: Object.fromEntries(
      REQUIRED_MONOTONE_DIMENSIONS.map((name) => [name, true])),
    epoch: 8, objects: [{ key: KEY, version: 4,
      disposition: "ADMIT", epoch: 8 }],
  };
  for (const pendingDeny of [undefined, null, "false", 0]) {
    const record = { ...base.objects[0], pendingDeny };
    const result = reconcileOlderBackup(restored, {
      ...base, objects: [record],
    });
    assert.equal(result.objects[0].suppliedFixtureVersionMatchOnly, false);
    assert.equal(result.objects[0].disposition, "HOLD");
    assert.equal(result.mustKeepProtectedTrafficClosed, true);
  }
});

test("inconsistent duplicated monotone ledger objects are rejected", () => {
  assert.throws(() => reconcileOlderBackup([{ key: KEY }], {
    independentlyVerified: true, completeThroughBackupBoundary: true,
    epoch: 8, objects: [{ key: KEY, version: 4,
      disposition: "ADMIT", epoch: 8 }, { key: KEY, version: 5,
      disposition: "HOLD", epoch: 8 }],
  }), /L1_INVALID_INDEPENDENT_LEDGER/);
});
