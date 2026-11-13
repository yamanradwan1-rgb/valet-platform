import assert from "node:assert/strict";
import test from "node:test";
import {
  admissionKey, admissionKeyId, compareAdmissionKeys,
} from "../typed-admission-key.mjs";
import {
  buildSelectiveBaseline, selectAdmissionLocks,
  assessAdmissionDependencies,
} from "../selective-baseline.mjs";
import { verifyRecoveryCase } from "../verified-recovery-case.mjs";
import { DIGEST, KEY, NOW, ORG, MEMBER, LOCATION, TRUST, USER,
  fixtureCase } from "./synthetic-fixture.mjs";

test("singleton UUID binary framing is canonical and length 17", () => {
  assert.equal(Buffer.from(KEY.hex, "hex").length, 17);
  assert.equal(KEY.hex.slice(0, 2), "01");
  assert.equal(KEY.rank, 9);
  assert.ok(admissionKeyId(KEY).includes(":USER:01"));
});

test("Location grant uses 49-byte 3-parent tuple, no surrogate ID", () => {
  const grant = admissionKey({ audience: KEY.audience,
    kind: "GRANT", ids: [ORG, MEMBER, LOCATION] });
  assert.equal(Buffer.from(grant.hex, "hex").length, 49);
  assert.equal(grant.hex.slice(0, 2), "02");
  assert.equal(grant.rank, 11);
  assert.throws(() => admissionKey({ audience: KEY.audience,
    kind: "GRANT", ids: [MEMBER] }), /L1_INVALID_KEY_CARDINALITY/);
});

test("unknown kinds and noncanonical IDs fail closed", () => {
  assert.throws(() => admissionKey({ audience: KEY.audience,
    kind: "OPERATOR", ids: [USER] }), /L1_UNKNOWN_KIND/);
  assert.throws(() => admissionKey({ audience: KEY.audience,
    kind: "USER", ids: ["wrong"] }), /L1_INVALID_UUID/);
  assert.throws(() => admissionKey({ audience: "production",
    kind: "GRANT", ids: [ORG, MEMBER] }), /L1_INVALID_KEY_CARDINALITY/);
});

test("rank order precedes within-rank UUID sort", () => {
  const o = admissionKey({ audience: KEY.audience, kind: "ORGANIZATION", ids: [ORG] });
  const g = admissionKey({ audience: KEY.audience, kind: "GRANT",
    ids: [ORG, MEMBER, LOCATION] });
  assert.ok(compareAdmissionKeys(KEY, o) < 0);
  assert.ok(compareAdmissionKeys(o, g) < 0);
});

test("unsigned legacy baseline never admits, including ACTIVE User", () => {
  const result = buildSelectiveBaseline([
    { key: KEY, materialDigest: DIGEST },
  ], [], null, NOW);
  assert.equal(result.rows[0].disposition, "HOLD");
  assert.equal(result.summary.held, 1);
  assert.equal(result.status, "ISOLATED_CANDIDATE_NOT_SQL_ADMITTED");
});

test("two separately signed synthetic case identities admit only exact row", () => {
  const result = buildSelectiveBaseline([
    { key: KEY, materialDigest: DIGEST },
  ], [fixtureCase()], TRUST, NOW);
  assert.equal(result.rows[0].disposition, "ADMIT");
  assert.equal(result.summary.admitted, 1);
  assert.match(result.publicDigest, /^[a-f0-9]{64}$/);
});

test("unsigned or tampered identity approval is rejected", () => {
  assert.throws(() => verifyRecoveryCase({
    ...fixtureCase(), signatures: [],
  }, TRUST, NOW), /L1_INDEPENDENT_APPROVAL_REQUIRED/);
  assert.throws(() => verifyRecoveryCase(fixtureCase({}, {
    operatorId: "attacker-different-operator",
  }), TRUST, NOW), /L1_INVALID_CASE_SIGNATURE/);
});

test("case cannot supply its own approved public key", () => {
  const envelope = fixtureCase();
  assert.throws(() => verifyRecoveryCase(envelope, {}, NOW),
    /L1_UNTRUSTED_CASE_SIGNER/);
  assert.throws(() => verifyRecoveryCase(envelope, null, NOW),
    /L1_OPERATOR_TRUST_NOT_CONFIGURED/);
});

test("case expiry and unsupported transition deny", () => {
  assert.throws(() => verifyRecoveryCase(fixtureCase(), TRUST,
    NOW + 999_999), /L1_CASE_EXPIRED/);
  assert.throws(() => verifyRecoveryCase(fixtureCase({
    from: "RETIRE", to: "ADMIT",
  }), TRUST, NOW), /L1_INVALID_TRANSITION/);
});

test("mis-scoped and duplicate ADMIT evidence never enters baseline", () => {
  assert.throws(() => buildSelectiveBaseline([], [fixtureCase()],
    TRUST, NOW), /L1_CASE_OBJECT_ABSENT/);
  assert.throws(() => buildSelectiveBaseline([
    { key: KEY, materialDigest: DIGEST },
    { key: KEY, materialDigest: DIGEST },
  ], [], TRUST, NOW), /L1_DUPLICATE_BASELINE_OBJECT/);
});

test("explicit preelected X lock for changed object, S for dependency", () => {
  const other = admissionKey({ audience: KEY.audience,
    kind: "ORGANIZATION", ids: [ORG] });
  const selected = selectAdmissionLocks([other, KEY], [KEY]);
  assert.equal(selected[0].admissionMode, "FOR UPDATE");
  assert.equal(selected[1].admissionMode, "FOR SHARE");
  assert.throws(() => selectAdmissionLocks([KEY], [other]),
    /L1_UNKNOWN_WRITE_DEPENDENCY/);
});

test("prepare and execute synthetic validation rejects committed HOLD", () => {
  const initial = { key: KEY, disposition: "ADMIT", admissionVersion: 2,
    materialDigest: DIGEST, generation: null };
  const required = [{ key: KEY, admissionVersion: 2,
    materialDigest: DIGEST }];
  assert.equal(assessAdmissionDependencies([initial], required).allowed, true);
  const held = { ...initial, disposition: "HOLD", admissionVersion: 3 };
  assert.equal(assessAdmissionDependencies([held], required).allowed, false);
  assert.equal(assessAdmissionDependencies([], required).allowed, false);
});

test("versions and generation bind positive authority", () => {
  const held = { key: KEY, disposition: "ADMIT",
    admissionVersion: 3, materialDigest: DIGEST, generation: 5 };
  const required = [{ key: KEY, admissionVersion: 3,
    materialDigest: DIGEST, generation: 4 }];
  assert.equal(assessAdmissionDependencies([held], required).allowed, false);
  assert.equal(assessAdmissionDependencies([{ ...held, generation: 4 }],
    required).allowed, true);
});
