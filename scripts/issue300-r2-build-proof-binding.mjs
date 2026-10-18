// Exact lease/source/output receipt binding shared by V2 manifest and HTTP issuer.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  cleanCandidate, currentBuildEvidence, validateLease,
} from "./issue300-r2-api-build-provenance.mjs";
import { verifyBuildOwnerSignature } from "./issue300-r2-owner-build-signature.mjs";
import { requireSignedBuildLease } from "./issue300-r2-owner-build-lease.mjs";

const sha40 = /^[a-f0-9]{40}$/;
const sha64 = /^[a-f0-9]{64}$/;
const leasePattern = /^issue300-r2-[a-z0-9-]{8,}$/;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const comparable = (path) => process.platform === "win32"
  ? path.toLowerCase() : path;

function ownedReceiptFolder(root) {
  const worktree = resolve(root);
  assert(!lstatSync(worktree).isSymbolicLink(),
    "ISSUE300_BUILD_ROOT_REPARSE_DENIED");
  // Canonicalize the root to accommodate genuine Windows 8.3 paths.
  let current = realpathSync.native(worktree);
  for (const part of ["tmp", "issue300-r2-w17-build-owned"]) {
    current = join(current, part);
    const stat = lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink() &&
      comparable(realpathSync.native(current)) === comparable(current),
    "ISSUE300_BUILD_ANCESTOR_REPARSE_DENIED");
  }
  return current;
}

export function assertBuildBinding(binding, candidateSha, leaseId) {
  assert.match(candidateSha ?? "", sha40);
  assert.match(leaseId ?? "", leasePattern);
  assert(binding && Object.keys(binding).sort().join("|") === [
    "candidateSha", "leaseId", "apiBundleSha256", "contractsBundleSha256",
    "sourceSha256", "apiBuildReceiptSha256",
  ].sort().join("|"), "ISSUE300_BUILD_BINDING_SCHEMA");
  assert.equal(binding.candidateSha, candidateSha, "ISSUE300_BUILD_CANDIDATE_MISMATCH");
  assert.equal(binding.leaseId, leaseId, "ISSUE300_BUILD_LEASE_MISMATCH");
  for (const field of ["apiBundleSha256", "contractsBundleSha256",
    "sourceSha256", "apiBuildReceiptSha256"]) {
    assert.match(binding[field] ?? "", sha64, `ISSUE300_BUILD_${field}_INVALID`);
  }
  return binding;
}

export function receiptBinding(receipt, rawBytes, candidateSha, leaseId) {
  assert(Buffer.isBuffer(rawBytes) && rawBytes.length > 0 &&
    rawBytes.length <= 8192, "ISSUE300_BUILD_RECEIPT_BYTES_INVALID");
  assert.equal(rawBytes.toString("utf8"), JSON.stringify(receipt),
    "ISSUE300_BUILD_RECEIPT_NONCANONICAL");
  return assertBuildBinding({
    candidateSha: receipt.candidateSha, leaseId: receipt.leaseId,
    apiBundleSha256: receipt.apiBundleSha256,
    contractsBundleSha256: receipt.contractsBundleSha256,
    sourceSha256: receipt.sourceSha256,
    apiBuildReceiptSha256: sha(rawBytes),
  }, candidateSha, leaseId);
}

export function readBoundReceiptFile(root, candidateSha, leaseId, receipt,
  verifyOwner = verifyBuildOwnerSignature) {
  assert.match(candidateSha ?? "", sha40);
  assert.match(leaseId ?? "", leasePattern);
  const path = join(ownedReceiptFolder(root),
    `R2_API_BUILD_${candidateSha}_${leaseId}.json`);
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    stat.size > 0 && stat.size <= 8192, "ISSUE300_BUILD_RECEIPT_FILE_INVALID");
  const bytes = readFileSync(path);
  const signaturePath = `${path}.sig`;
  const sigStat = lstatSync(signaturePath);
  assert(sigStat.isFile() && !sigStat.isSymbolicLink() &&
    sigStat.nlink === 1 && sigStat.size >= 88 && sigStat.size <= 90,
  "ISSUE300_BUILD_SIGNATURE_FILE_INVALID");
  const signature = readFileSync(signaturePath, "utf8").trim();
  verifyOwner(bytes, signature);
  const binding = receiptBinding(receipt, bytes, candidateSha, leaseId);
  assert(readFileSync(path).equals(bytes) &&
    readFileSync(signaturePath, "utf8").trim() === signature,
  "ISSUE300_BUILD_SIGNED_RECEIPT_RACE");
  return binding;
}

export function currentBoundBuild(root, env, verified = currentBuildEvidence,
  { head = cleanCandidate, lease = validateLease,
    receiptFile = readBoundReceiptFile,
    ownerLease = requireSignedBuildLease } = {}) {
  const candidateSha = head(root);
  const { leaseId } = lease(env, candidateSha);
  const receipt = verified(root, leaseId);
  const binding = receiptFile(root, candidateSha, leaseId, receipt);
  ownerLease(root, receipt);
  assert.equal(head(root), candidateSha, "ISSUE300_BUILD_HEAD_RACE");
  // A fresh read also catches output/source swaps during receipt hashing.
  assert.deepEqual(verified(root, leaseId), receipt, "ISSUE300_BUILD_VERIFY_RACE");
  assert.deepEqual(receiptFile(root, candidateSha, leaseId, receipt), binding,
    "ISSUE300_BUILD_RECEIPT_RACE");
  return binding;
}

export function assertManifestBuildBinding(manifest, binding) {
  assertBuildBinding(binding, binding?.candidateSha, binding?.leaseId);
  assert.equal(manifest?.candidateSha, binding.candidateSha);
  assert.equal(manifest?.leaseId, binding.leaseId);
  for (const field of ["apiBundleSha256", "contractsBundleSha256",
    "sourceSha256", "apiBuildReceiptSha256"]) {
    assert.equal(manifest?.[field], binding[field],
      `ISSUE300_MANIFEST_BUILD_${field}_MISMATCH`);
  }
  return binding;
}
