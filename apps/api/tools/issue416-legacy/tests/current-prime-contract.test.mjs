import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  ADMISSION_RANK, admissionKey, admissionKeyId, compareAdmissionKeys,
} from "../typed-admission-key.mjs";
import {
  assessAdmissionDependencies, buildSelectiveBaseline, selectAdmissionLocks,
} from "../selective-baseline.mjs";
import {
  canonicalCaseBytes, verifyRecoveryCase,
} from "../verified-recovery-case.mjs";
import { reconcileOlderBackup, REQUIRED_MONOTONE_DIMENSIONS,
} from "../older-backup-fence.mjs";
import {
  DIGEST, KEY, NOW, ORG, USER, TRUST, fixtureCase,
} from "./synthetic-fixture.mjs";

const SQL_KINDS = [
  "USER", "ORGANIZATION", "ENTITLEMENT", "MEMBERSHIP", "LOCATION",
  "GRANT", "SESSION", "REFRESH", "FACTOR", "RECOVERY_SET",
  "INVITATION", "PASSWORD_RESET", "PUSH_REGISTRATION",
];

test("W2 migration 113 uses exact 13 full object-kind labels, not aliases", () => {
  assert.deepEqual(Object.keys(ADMISSION_RANK).sort(), [...SQL_KINDS].sort());
  assert.throws(() => admissionKey({
    audience: KEY.audience, kind: "U", ids: [USER],
  }), /L1_UNKNOWN_KIND/);
  assert.equal(KEY.kind, "USER");
});

test("typed gate validation rejects unsupported audience and extra fields", () => {
  assert.throws(() => admissionKeyId({ ...KEY, audience: "" }),
    /L1_INVALID_TYPED_KEY/);
  assert.throws(() => admissionKeyId({ ...KEY, rawSqlOwner: true }),
    /L1_INVALID_TYPED_KEY/);
  assert.throws(() => admissionKeyId({ ...KEY, rank: 13 }),
    /L1_INVALID_TYPED_KEY/);
});

test("cross-audience lock candidates cannot be sorted or mixed", () => {
  const other = admissionKey({ audience: "issue416-alt-test",
    kind: "USER", ids: [USER] });
  assert.throws(() => compareAdmissionKeys(KEY, other),
    /L1_CROSS_AUDIENCE_KEY_ORDER/);
  assert.throws(() => selectAdmissionLocks([KEY, other]),
    /L1_CROSS_AUDIENCE_DEPENDENCY/);
  assert.throws(() => buildSelectiveBaseline([
    { key: KEY, materialDigest: DIGEST },
    { key: other, materialDigest: DIGEST },
  ], [], TRUST, NOW), /L1_CROSS_AUDIENCE_KEY_ORDER/);
});

test("empty dependencies never produce allowed auth or positive signer facts", () => {
  assert.throws(() => selectAdmissionLocks([], []),
    /L1_EMPTY_DEPENDENCY_SET/);
  assert.equal(assessAdmissionDependencies([], []).allowed, false);
  assert.equal(assessAdmissionDependencies([{
    key: KEY, disposition: "ADMIT", admissionVersion: 2,
    materialDigest: DIGEST, generation: null,
  }], []).allowed, false);
});

test("a duplicate ADMIT must not override a committed HOLD gate", () => {
  const admitted = { key: KEY, disposition: "ADMIT",
    admissionVersion: 2, materialDigest: DIGEST, generation: null };
  const held = { ...admitted, disposition: "HOLD", admissionVersion: 3 };
  const required = [{ key: KEY, admissionVersion: 2,
    materialDigest: DIGEST }];
  for (const gates of [[held, admitted], [admitted, held]]) {
    const check = assessAdmissionDependencies(gates, required);
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "L1_DUPLICATE_GATE");
  }
});

test("duplicate signed dependency and mismatched material always deny", () => {
  const admitted = { key: KEY, disposition: "ADMIT",
    admissionVersion: 2, materialDigest: DIGEST, generation: null };
  const required = { key: KEY, admissionVersion: 2,
    materialDigest: DIGEST };
  assert.equal(assessAdmissionDependencies([admitted],
    [required, required]).allowed, false);
  assert.equal(assessAdmissionDependencies([admitted],
    [{ ...required, materialDigest: "00".repeat(32) }]).allowed, false);
});

test("case signatures have isolated protocol context and reject same-root roles", () => {
  const envelope = fixtureCase();
  const signed = canonicalCaseBytes(envelope.body);
  assert.equal(signed.toString("utf8").startsWith(
    "VAYLET_ISSUE416_SYNTHETIC_L1_CASE_V1\u0000"), true);
  const oneRoot = generateKeyPairSync("ed25519");
  const duplicate = sign(null, signed, oneRoot.privateKey).toString("base64");
  const fakeSameRoot = {
    body: envelope.body,
    signatures: [
      { role: "CASE_VERIFIER", keyId: "case", base64Signature: duplicate },
      { role: "SECURITY_APPROVER", keyId: "approve",
        base64Signature: duplicate },
    ],
  };
  assert.throws(() => verifyRecoveryCase(fakeSameRoot, {
    case: { role: "CASE_VERIFIER", enabled: true,
      publicKey: oneRoot.publicKey },
    approve: { role: "SECURITY_APPROVER", enabled: true,
      publicKey: oneRoot.publicKey },
  }, NOW), /L1_INDEPENDENT_APPROVAL_REQUIRED/);
});

test("partial monotone checkpoint cannot qualify even matching restored version", () => {
  const restored = [{ key: KEY, disposition: "ADMIT",
    admissionVersion: 5, boundaryEpoch: 8 }];
  const covered = Object.fromEntries(
    REQUIRED_MONOTONE_DIMENSIONS.map((name) => [name, true]));
  delete covered.MFA_RECOVERY_CODE_CONSUMPTION;
  const result = reconcileOlderBackup(restored, {
    independentlyVerified: true,
    completeThroughBackupBoundary: true, epoch: 8,
    coveredDimensions: covered,
    objects: [{ key: KEY, disposition: "ADMIT",
      version: 5, epoch: 8, pendingDeny: false }],
  });
  assert.equal(result.objects[0].disposition, "HOLD");
  assert.equal(result.objects[0].suppliedFixtureVersionMatchOnly, false);
  assert.deepEqual(result.missingMonotoneDimensions, [
    "MFA_RECOVERY_CODE_CONSUMPTION",
  ]);
  assert.equal(result.mustKeepProtectedTrafficClosed, true);
});

test("outside-backup coverage includes codes, sessions, keys, audit and entitlements", () => {
  for (const fragment of ["CODE_CONSUMPTION", "SESSION_REFRESH",
    "ENTITLEMENT", "KEY_RETIREMENT", "AUDIT", "ADMISSION"]) {
    assert.equal(REQUIRED_MONOTONE_DIMENSIONS.some((name) =>
      name.includes(fragment)), true, fragment);
  }
  const other = admissionKey({
    audience: KEY.audience, kind: "ORGANIZATION", ids: [ORG],
  });
  const result = assessAdmissionDependencies([
    { key: KEY, disposition: "ADMIT", admissionVersion: 2,
      materialDigest: DIGEST, generation: null },
    { key: other, disposition: "HOLD", admissionVersion: 3,
      materialDigest: DIGEST, generation: null },
  ], [{ key: KEY, admissionVersion: 2, materialDigest: DIGEST },
      { key: other, admissionVersion: 3, materialDigest: DIGEST }]);
  assert.equal(result.allowed, false);
});
