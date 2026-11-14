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

test("L1 audience accepts migration113 proof-key grammar boundaries", () => {
  for (const audience of ["a", "EU.prod:v1", "9", "A".repeat(80),
    "A".repeat(96), "Z_1:prod.test-2"]) {
    const key = admissionKey({ audience, kind: "USER", ids: [USER] });
    assert.equal(key.audience, audience);
    assert.equal(admissionKeyId(key).startsWith(`${audience}:USER:`), true);
  }
  for (const audience of ["", "A".repeat(97), ".prefix", ":prefix",
    "-prefix", "a/b", "a b", "ü", "a\n", "a\u0000b"]) {
    assert.throws(() => admissionKey({ audience, kind: "USER", ids: [USER] }),
      /L1_INVALID_AUDIENCE/, audience);
    assert.throws(() => admissionKeyId({ ...KEY, audience }),
      /L1_INVALID_TYPED_KEY/, audience);
  }
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

test("empty T0 input is only a zero-object offline candidate, not authority", () => {
  const empty = buildSelectiveBaseline([], [], null, NOW);
  assert.equal(empty.status, "ISOLATED_CANDIDATE_NOT_SQL_ADMITTED");
  assert.deepEqual(empty.summary, { objects: 0, admitted: 0, held: 0 });
  assert.deepEqual(empty.rows, []);
  assert.throws(() => buildSelectiveBaseline(null, [], null, NOW),
    /L1_MISSING_ATTESTED_INVENTORY/);
  assert.throws(() => buildSelectiveBaseline([], null, null, NOW),
    /L1_MISSING_ATTESTED_INVENTORY/);
  assert.throws(() => buildSelectiveBaseline([], [fixtureCase()], TRUST, NOW),
    /L1_CASE_OBJECT_ABSENT/);
});

test("two separately signed synthetic case identities admit only exact row", () => {
  const result = buildSelectiveBaseline([
    { key: KEY, materialDigest: DIGEST },
  ], [fixtureCase()], TRUST, NOW);
  assert.equal(result.rows[0].disposition, "ADMIT");
  assert.equal(result.summary.admitted, 1);
  assert.match(result.publicDigest, /^[a-f0-9]{64}$/);
});

test("signed pre-boundary sessions refresh and push never gain L1 ADMIT", () => {
  for (const kind of ["SESSION", "REFRESH", "PUSH_REGISTRATION"]) {
    const key = admissionKey({ audience: KEY.audience, kind, ids: [USER] });
    assert.throws(() => buildSelectiveBaseline([
      { key, materialDigest: DIGEST },
    ], [fixtureCase({ key })], TRUST, NOW),
    /L1_LEGACY_AUTHORITY_ADMIT_FORBIDDEN/, kind);
    const held = buildSelectiveBaseline([
      { key, materialDigest: DIGEST },
    ], [], TRUST, NOW);
    assert.equal(held.rows[0].disposition, "HOLD");
  }
});

test("grant admission requires all three exact composite-key parents admitted", () => {
  const grant = admissionKey({ audience: KEY.audience,
    kind: "GRANT", ids: [ORG, MEMBER, LOCATION] });
  const parents = [
    admissionKey({ audience: KEY.audience, kind: "ORGANIZATION", ids: [ORG] }),
    admissionKey({ audience: KEY.audience, kind: "MEMBERSHIP", ids: [MEMBER] }),
    admissionKey({ audience: KEY.audience, kind: "LOCATION", ids: [LOCATION] }),
  ];
  const grantCase = fixtureCase({ key: grant, caseId: "synthetic-grant-case-001" });
  const grantRow = { key: grant, materialDigest: DIGEST };
  assert.throws(() => buildSelectiveBaseline([grantRow],
    [grantCase], TRUST, NOW), /L1_UNVERIFIED_GRANT_PARENTS/);
  const fullInventory = [grantRow, ...parents.map((key) => ({
    key, materialDigest: DIGEST,
  }))];
  assert.throws(() => buildSelectiveBaseline(fullInventory,
    [grantCase], TRUST, NOW), /L1_UNVERIFIED_GRANT_PARENTS/);
  const cases = [grantCase, ...parents.map((key, index) => fixtureCase({
    key, caseId: `synthetic-grant-parent-${index}`,
  }))];
  const candidate = buildSelectiveBaseline(fullInventory, cases, TRUST, NOW);
  assert.equal(candidate.summary.admitted, 4);
  const wrongParent = admissionKey({ audience: KEY.audience,
    kind: "LOCATION", ids: [USER] });
  const wrongCases = [grantCase, ...cases.slice(1, 3), fixtureCase({
    key: wrongParent, caseId: "synthetic-wrong-location-parent",
  })];
  assert.throws(() => buildSelectiveBaseline([
    grantRow, fullInventory[1], fullInventory[2],
    { key: wrongParent, materialDigest: DIGEST },
  ], wrongCases, TRUST, NOW), /L1_UNVERIFIED_GRANT_PARENTS/);
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
