import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
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

test("L1 declares the 13 source-derived W2 object-kind labels, not aliases", () => {
  assert.deepEqual(Object.keys(ADMISSION_RANK).sort(), [...SQL_KINDS].sort());
  assert.throws(() => admissionKey({
    audience: KEY.audience, kind: "U", ids: [USER],
  }), /L1_UNKNOWN_KIND/);
  assert.equal(KEY.kind, "USER");
});

test("local migration113 object kinds and audience match L1 when integrated", (t) => {
  const directory = new URL("../../../../../packages/database/prisma/migrations/",
    import.meta.url);
  const filenames = readdirSync(directory).filter((name) =>
    name.endsWith("issue416_vap1_private_foundation"));
  if (!filenames.length) {
    t.skip("migration113 absent from W5 base; rerun on integrated Prime");
    return;
  }
  assert.equal(filenames.length, 1);
  const sql = readFileSync(new URL(`${filenames[0]}/migration.sql`, directory),
    "utf8");
  const kinds = sql.match(/object_kind text NOT NULL CHECK \(object_kind IN \(([\s\S]*?)\)\)/);
  assert.ok(kinds, "authority_admissions object_kind CHECK must exist");
  const names = [...kinds[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), Object.keys(ADMISSION_RANK).sort());
  const audience = sql.match(/CREATE TABLE auth_proof_private\.proof_keys \([\s\S]*?audience ~ '([^']+)'/);
  assert.ok(audience, "migration113 proof-key audience CHECK must exist");
  const sqlAudience = new RegExp(audience[1]);
  for (const value of ["a", "EU.prod:v1", "a".repeat(80),
    "a".repeat(96), "a".repeat(97), "a/b", "", "é"]) {
    const nodeAccepts = (() => {
      try {
        admissionKey({ audience: value, kind: "USER", ids: [USER] });
        return true;
      } catch { return false; }
    })();
    assert.equal(nodeAccepts, sqlAudience.test(value), value);
  }
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

test("operator recovery signatures must use independent Ed25519 roots", () => {
  const body = fixtureCase().body;
  const message = canonicalCaseBytes(body);
  for (const algorithm of ["ec", "rsa"]) {
    const options = algorithm === "ec" ? { namedCurve: "prime256v1" }
      : { modulusLength: 1536 }; // Base64 fits the preexisting 256-char bound.
    const first = generateKeyPairSync(algorithm, options);
    const second = generateKeyPairSync(algorithm, options);
    const envelope = { body, signatures: [
      { role: "CASE_VERIFIER", keyId: "one",
        base64Signature: sign("sha256", message, first.privateKey).toString("base64") },
      { role: "SECURITY_APPROVER", keyId: "two",
        base64Signature: sign("sha256", message, second.privateKey).toString("base64") },
    ] };
    const trust = {
      one: { role: "CASE_VERIFIER", enabled: true, publicKey: first.publicKey },
      two: { role: "SECURITY_APPROVER", enabled: true,
        publicKey: second.publicKey.export({ type: "spki", format: "pem" }) },
    };
    assert.throws(() => verifyRecoveryCase(envelope, trust, NOW),
      /L1_INVALID_CASE_SIGNATURE/, algorithm);
  }
  const original = fixtureCase();
  assert.equal(verifyRecoveryCase(original, TRUST, NOW).to, "ADMIT");
  const pemTrust = Object.fromEntries(Object.entries(TRUST).map(
    ([id, signer]) => [id, {
      ...signer, publicKey: signer.publicKey.export({ type: "spki", format: "pem" }),
    }]));
  assert.equal(verifyRecoveryCase(original, pemTrust, NOW).approvedBy.length, 2);
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
