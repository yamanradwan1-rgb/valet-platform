import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import {
  assertBuildOutput,
  verifiedOwnerLease,
  verifyOwnerSignature,
} from "./issue300-r2-owner-build-issuer.mjs";

const keys = generateKeyPairSync("ed25519"); // Disposable test key, never Owner's key.
const foreign = generateKeyPairSync("ed25519");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const candidateSha = "a".repeat(40);
const leaseId = "issue300-r2-w17-test-only-123456";
const now = Date.parse("2026-10-19T00:00:00Z");
const lease = Object.freeze({
  version: 1,
  purpose: "ISSUE300_R2_OWNER_BUILD_LEASE",
  candidateSha,
  leaseId,
  issuedAt: new Date(now - 30_000).toISOString(),
  expiresAt: new Date(now + 300_000).toISOString(),
});
const sealed = (value, key = keys.privateKey) => {
  const bytes = Buffer.from(JSON.stringify(value));
  return { bytes, sidecar: sign(null, bytes, key).toString("base64") };
};

test("only exact signed raw Owner lease authorizes candidate + lease + expiry", () => {
  const proof = sealed(lease);
  const verified = verifiedOwnerLease(
    proof.bytes,
    proof.sidecar,
    candidateSha,
    leaseId,
    now,
    keys.publicKey,
  );
  assert.equal(verified.candidateSha, candidateSha);
  assert.equal(verified.sha256, sha256(proof.bytes));
  assert.equal(verified.expiresAtMs, Date.parse(lease.expiresAt));
  assert(Object.isFrozen(verified));
  assert.throws(
    () =>
      verifiedOwnerLease(
        proof.bytes,
        proof.sidecar,
        "b".repeat(40),
        leaseId,
        now,
        keys.publicKey,
      ),
    /SOURCE_MISMATCH/,
  );
  assert.throws(
    () =>
      verifiedOwnerLease(
        proof.bytes,
        proof.sidecar,
        candidateSha,
        "issue300-r2-foreign-lease-1234",
        now,
        keys.publicKey,
      ),
    /ID_MISMATCH/,
  );
});

test("tampered, unsigned, wrong-key or malformed Owner lease signature fails", () => {
  const proof = sealed(lease);
  assert.throws(
    () => verifyOwnerSignature(proof.bytes, proof.sidecar),
    /SIGNATURE_INVALID/,
  ); // Pinned Owner key rejects a self-created test key.
  assert.throws(
    () =>
      verifiedOwnerLease(
        proof.bytes,
        proof.sidecar,
        candidateSha,
        leaseId,
        now,
        foreign.publicKey,
      ),
    /SIGNATURE_INVALID/,
  );
  const changed = Buffer.from(
    JSON.stringify({ ...lease, candidateSha: "b".repeat(40) }),
  );
  assert.throws(
    () =>
      verifiedOwnerLease(
        changed,
        proof.sidecar,
        candidateSha,
        leaseId,
        now,
        keys.publicKey,
      ),
    /SIGNATURE_INVALID/,
  );
  assert.throws(
    () =>
      verifiedOwnerLease(
        proof.bytes,
        "",
        candidateSha,
        leaseId,
        now,
        keys.publicKey,
      ),
    /NOT_CANONICAL/,
  );
  assert.throws(
    () =>
      verifiedOwnerLease(
        proof.bytes,
        JSON.stringify({ signatureBase64: proof.sidecar }),
        candidateSha,
        leaseId,
        now,
        keys.publicKey,
      ),
    /NOT_CANONICAL/,
  );
});

test("signed expiry, future lease, overlong duration and unknown fields deny", () => {
  const changes = [
    { issuedAt: new Date(now + 5_000).toISOString() },
    { expiresAt: new Date(now - 1_000).toISOString() },
    { expiresAt: new Date(now + 901_000).toISOString() },
    { issuedAt: "not-a-time" },
    { purpose: "ARBITRARY_OWNER_ACTION" },
    { version: 2 },
    { extraKey: "source-not-reviewed" },
  ];
  for (const diff of changes) {
    const data = sealed({ ...lease, ...diff });
    assert.throws(() =>
      verifiedOwnerLease(
        data.bytes,
        data.sidecar,
        candidateSha,
        leaseId,
        now,
        keys.publicKey,
      ),
    );
  }
});

const sourceSha256 = "b".repeat(64);
const apiBundleSha256 = "c".repeat(64);
const contractsBundleSha256 = "d".repeat(64);
const expected = {
  candidateSha,
  leaseId,
  sourceSha256,
  apiBundleSha256,
  contractsBundleSha256,
};
const receipt = {
  ...expected,
  exitCode: 0,
  contractsExitCode: 0,
  freshDist: true,
  startedAt: "2026-10-19T00:00:00Z",
  finishedAt: "2026-10-19T00:00:01Z",
};
const serialized = Buffer.from(JSON.stringify(receipt));
const result = { ...expected, receiptSha256: sha256(serialized) };

test("signed receipt source, contracts, API and actual W17 result must match", () => {
  assert.equal(
    assertBuildOutput(result, receipt, serialized, expected),
    result.receiptSha256,
  );
  for (const property of [
    "candidateSha",
    "leaseId",
    "sourceSha256",
    "apiBundleSha256",
    "contractsBundleSha256",
  ]) {
    const changed = { ...expected, [property]: "invalid" };
    assert.throws(() =>
      assertBuildOutput(result, receipt, serialized, changed),
    );
    assert.throws(() =>
      assertBuildOutput(
        { ...result, [property]: "changed" },
        receipt,
        serialized,
        expected,
      ),
    );
  }
});

test("failed contracts/API, old dist, swapped raw receipt and forged digest deny", () => {
  for (const change of [
    { exitCode: 1 },
    { contractsExitCode: 2 },
    { freshDist: false },
  ])
    assert.throws(() =>
      assertBuildOutput(
        result,
        { ...receipt, ...change },
        serialized,
        expected,
      ),
    );
  assert.throws(
    () =>
      assertBuildOutput(
        result,
        receipt,
        Buffer.from(JSON.stringify({ ...receipt, freshDist: false })),
        expected,
      ),
    /DIGEST_MISMATCH/,
  );
  assert.throws(
    () =>
      assertBuildOutput(
        { ...result, receiptSha256: "f".repeat(64) },
        receipt,
        serialized,
        expected,
      ),
    /DIGEST_MISMATCH/,
  );
});
