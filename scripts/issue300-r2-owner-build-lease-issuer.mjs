/* global process, console, Buffer */
// Owner-only, pre-build W17 lease issuer. Does not launch a build or service.
import assert from "node:assert/strict";
import {
  createHash, createPublicKey, randomBytes, sign, verify,
} from "node:crypto";
import {
  lstatSync, realpathSync, writeFileSync,
} from "node:fs";
import { dirname, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanCandidate } from "./issue300-r2-api-build-provenance.mjs";
import { requireOwnerSigner } from "./issue300-r2-owner-build-issuer.mjs";
import {
  buildOwnerDirectories, loadExact, ownedLocation,
} from "./issue300-r2-owner-build-paths.mjs";
import { verifyBuildOwnerSignature } from "./issue300-r2-owner-build-signature.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exactPurpose = "ISSUE300_R2_OWNER_BUILD_LEASE";
const keyFile = "issuer-private.pem";
const leaseTtlMs = 10 * 60_000;
const sha40 = /^[a-f0-9]{40}$/;
const leasePattern = /^issue300-r2-w17-[a-f0-9]{40}$/;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => process.platform === "win32"
  ? value.toLowerCase() : value;

// A worktree/root alias must never turn a user-controlled path into Owner
// custody. This rejects junctions/symlinks at every root ancestor, too.
export function assertExactRoot(root) {
  const absolute = resolve(root);
  const filesystemRoot = parse(absolute).root;
  let current = filesystemRoot;
  for (const part of relative(filesystemRoot, absolute).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink() &&
      canonical(realpathSync.native(current)) === canonical(current),
    "BUILD_LEASE_ROOT_ALIAS_DENIED");
  }
  assert(canonical(realpathSync.native(absolute)) === canonical(absolute),
    "BUILD_LEASE_ROOT_ALIAS_DENIED");
  return absolute;
}

export function encodeLease({
  candidateSha, leaseId, now = Date.now(), ttlMs = leaseTtlMs,
}) {
  assert.match(candidateSha ?? "", sha40, "BUILD_LEASE_CANDIDATE_INVALID");
  assert.match(leaseId ?? "", leasePattern, "BUILD_LEASE_ID_INVALID");
  assert(Number.isSafeInteger(now) && now > 0 &&
    Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= 900_000,
  "BUILD_LEASE_TIME_INVALID");
  return Buffer.from(JSON.stringify({
    version: 1,
    purpose: exactPurpose,
    candidateSha,
    leaseId,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  }));
}

// Test-only injection is explicit here. Production MUST first call
// requireOwnerSigner() and MUST verify with the pinned Owner SPKI below.
export function signLeaseBytes(bytes, privateKey, publicKey) {
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 4096);
  const signature = sign(null, bytes, privateKey);
  assert.equal(signature.length, 64, "BUILD_LEASE_SIGNATURE_LENGTH");
  assert(verify(null, bytes, publicKey, signature),
    "BUILD_LEASE_SIGNATURE_SELF_CHECK");
  const encoded = signature.toString("base64");
  assert.match(encoded, /^[A-Za-z0-9+/]{86}==$/);
  return encoded;
}

export function requireIssueAuthorization(env, candidateSha) {
  assert.equal(env.NODE_ENV, "test", "BUILD_LEASE_ISSUER_TEST_ONLY");
  assert.equal(env.ISSUE300_W17_OWNER_LEASE_ISSUE_ENABLE, "1",
    "BUILD_LEASE_OWNER_EXPLICIT_OPT_IN");
  assert.equal(env.ISSUE300_R2_CANDIDATE_SHA, candidateSha,
    "BUILD_LEASE_ISSUER_SHA_MISMATCH");
}

export function issueOwnerBuildLease(root = projectRoot, env = process.env) {
  const canonicalRoot = assertExactRoot(root);
  const candidateSha = cleanCandidate(canonicalRoot);
  requireIssueAuthorization(env, candidateSha);
  // No issuer-folder creation by an untrusted CLI; Prime must provision it
  // with Owner-only permissions. Refuse directory aliases and hardlinks.
  const folder = ownedLocation(canonicalRoot, buildOwnerDirectories.issuer);
  const privatePem = loadExact(join(folder, keyFile), folder, 8192);
  const privateKey = requireOwnerSigner(privatePem);
  const ownerPublicKey = createPublicKey(privateKey);
  const leaseId = "issue300-r2-w17-" + randomBytes(20).toString("hex");
  const bytes = encodeLease({ candidateSha, leaseId });
  const encoded = signLeaseBytes(bytes, privateKey, ownerPublicKey);
  // Consumer requires canonical JSON + detached base64 signature of
  // EXACT raw bytes; never use a JSON signature envelope or binary .sig.
  const basename = `W17_BUILD_LEASE_${candidateSha}_${leaseId}.json`;
  const target = join(folder, basename);
  const signaturePath = target + ".sig";
  assert.equal(dirname(target), folder);
  // wx prevents overwriting existing files/aliases. No cleanup of a
  // partial issue; an incomplete pair remains invalid for consumers.
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  writeFileSync(signaturePath, encoded, { flag: "wx", mode: 0o600 });
  // Verify Owner pin and re-read each file using the strict inode/no-alias
  // path helper, so no forged PASS based on the in-memory signature.
  const reread = loadExact(target, folder, 4096);
  const sidecar = loadExact(signaturePath, folder, 256).toString("utf8");
  assert(reread.equals(bytes) && sidecar === encoded,
    "BUILD_LEASE_ISSUER_WRITTEN_BYTES_CHANGED");
  verifyBuildOwnerSignature(reread, sidecar);
  const record = JSON.parse(reread.toString("utf8"));
  assert.equal(JSON.stringify(record), reread.toString("utf8"),
    "BUILD_LEASE_ISSUER_NONCANONICAL");
  assert.equal(record.candidateSha, candidateSha);
  assert.equal(record.leaseId, leaseId);
  return Object.freeze({
    candidateSha, leaseId, expiresAt: record.expiresAt,
    leaseSha256: digest(reread), leasePath: target,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.deepEqual(process.argv.slice(2), ["--issue"],
      "BUILD_LEASE_OWNER_EXACT_MODE_REQUIRED");
    console.log(JSON.stringify(issueOwnerBuildLease()));
  } catch (error) {
    // Never print private key, env, filesystem contents or sensitive URLs.
    console.error(`BUILD_LEASE_OWNER_REFUSED:${error?.code ?? "CHECK_FAILED"}`);
    process.exitCode = 1;
  }
}
