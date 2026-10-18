// Independent Owner-signed exclusive build lease: no mutable env flag is trust.
import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyBuildOwnerSignature } from "./issue300-r2-owner-build-signature.mjs";

export function assertOwnerBuildLease(lease, receipt, now = Date.now()) {
  assert(lease && Object.keys(lease).sort().join("|") === [
    "candidateSha", "leaseId", "purpose", "issuedAt",
    "expiresAt", "version",
  ].sort().join("|"), "BUILD_OWNER_LEASE_SCHEMA");
  assert.equal(lease.version, 1);
  assert.equal(lease.purpose, "ISSUE300_R2_OWNER_BUILD_LEASE");
  assert.equal(lease.candidateSha, receipt.candidateSha);
  assert.equal(lease.leaseId, receipt.leaseId);
  const start = Date.parse(lease.issuedAt);
  const expiry = Date.parse(lease.expiresAt);
  const builtAt = Date.parse(receipt.startedAt);
  const finishedAt = Date.parse(receipt.finishedAt);
  assert([start, expiry, builtAt, finishedAt].every(Number.isFinite) &&
    start <= builtAt && builtAt <= finishedAt && finishedAt <= expiry &&
    now >= start && now < expiry &&
    expiry - start > 0 && expiry - start <= 15 * 60_000,
  "BUILD_OWNER_SIGNED_LEASE_EXPIRED_OR_MISMATCH");
  return true;
}

function readSigned(path) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    stat.size > 0 && stat.size <= 8192, "BUILD_OWNER_LEASE_FILE_UNSAFE");
  const signaturePath = `${path}.sig`;
  const sigStat = lstatSync(signaturePath);
  assert(sigStat.isFile() && !sigStat.isSymbolicLink() && sigStat.nlink === 1 &&
    sigStat.size >= 88 && sigStat.size <= 90,
  "BUILD_OWNER_LEASE_SIGNATURE_UNSAFE");
  return { bytes: readFileSync(path), signature: readFileSync(signaturePath, "utf8").trim() };
}

export function requireSignedBuildLease(root, receipt,
  now = Date.now(), verifyOwner = verifyBuildOwnerSignature) {
  const path = join(root, "tmp/issue300-r2-v2-prime-owned",
    `W17_BUILD_LEASE_${receipt.candidateSha}_${receipt.leaseId}.json`);
  const { bytes, signature } = readSigned(path);
  verifyOwner(bytes, signature);
  const record = JSON.parse(bytes.toString("utf8"));
  assert.equal(JSON.stringify(record), bytes.toString("utf8"),
    "BUILD_OWNER_LEASE_NONCANONICAL");
  assertOwnerBuildLease(record, receipt, now);
  const current = readSigned(path);
  assert(current.bytes.equals(bytes) && current.signature === signature,
    "BUILD_OWNER_LEASE_REPLACED");
  return true;
}
