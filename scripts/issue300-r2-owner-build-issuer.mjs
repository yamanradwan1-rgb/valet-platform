/* global process, console, Buffer */
// Owner-only, offline W17 build launcher. No database, API or HTTP access.
import assert from "node:assert/strict";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanCandidate,
  currentBuildEvidence,
  runBuildUnderLease,
} from "./issue300-r2-api-build-provenance.mjs";
import {
  buildOwnerDirectories,
  loadExact,
  ownedLocation,
} from "./issue300-r2-owner-build-paths.mjs";
export { loadExact, ownedLocation } from "./issue300-r2-owner-build-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const issuerDirectory = buildOwnerDirectories.issuer;
const buildDirectory = buildOwnerDirectories.build;
const issuerKey = "issuer-private.pem";
const publicPem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=
-----END PUBLIC KEY-----
`;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(
  digest(publicPem),
  "7d13ad66aaf979dc269e13ac33a4f557661a8080cee074ce3e64eec922824f22",
);
const ownerKey = createPublicKey(publicPem);
const candidatePattern = /^[a-f0-9]{40}$/;
const leasePattern = /^issue300-r2-[a-z0-9-]{8,}$/;

export function verifyOwnerSignature(payload, text, key = ownerKey) {
  assert.equal(typeof text, "string");
  const encoded = text.trim();
  assert.match(
    encoded,
    /^[A-Za-z0-9+/]{86}==$/,
    "BUILD_OWNER_SIGNATURE_NOT_CANONICAL",
  );
  const signature = Buffer.from(encoded, "base64");
  assert.equal(signature.length, 64);
  assert.equal(signature.toString("base64"), encoded);
  assert(
    verify(null, payload, key, signature),
    "BUILD_OWNER_SIGNATURE_INVALID",
  );
}

export function verifiedOwnerLease(
  bytes,
  signature,
  candidateSha,
  leaseId,
  now = Date.now(),
  key = ownerKey,
) {
  verifyOwnerSignature(bytes, signature, key); // Verify raw signature BEFORE JSON.
  const lease = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(
    Object.keys(lease).sort(),
    [
      "candidateSha",
      "expiresAt",
      "issuedAt",
      "leaseId",
      "purpose",
      "version",
    ].sort(),
    "BUILD_OWNER_LEASE_SCHEMA_INVALID",
  );
  assert.equal(lease.version, 1);
  assert.equal(lease.purpose, "ISSUE300_R2_OWNER_BUILD_LEASE");
  assert.match(lease.candidateSha ?? "", candidatePattern);
  assert.match(lease.leaseId ?? "", leasePattern);
  assert.equal(
    lease.candidateSha,
    candidateSha,
    "BUILD_OWNER_LEASE_SOURCE_MISMATCH",
  );
  assert.equal(lease.leaseId, leaseId, "BUILD_OWNER_LEASE_ID_MISMATCH");
  const issuedAt = Date.parse(lease.issuedAt);
  const expiresAt = Date.parse(lease.expiresAt);
  assert(
    Number.isFinite(issuedAt) &&
      Number.isFinite(expiresAt) &&
      issuedAt <= now &&
      expiresAt > now &&
      expiresAt - issuedAt <= 900_000 &&
      expiresAt <= now + 900_000,
    "BUILD_OWNER_LEASE_EXPIRED_OR_UNBOUNDED",
  );
  return Object.freeze({
    ...lease,
    expiresAtMs: expiresAt,
    sha256: digest(bytes),
  });
}

export function assertBuildOutput(result, receipt, bytes, expected) {
  const keys = [
    "candidateSha",
    "leaseId",
    "sourceSha256",
    "apiBundleSha256",
    "contractsBundleSha256",
  ];
  for (const key of keys) {
    assert.equal(receipt[key], expected[key], `BUILD_OWNER_${key}_MISMATCH`);
    if (result[key] !== undefined)
      assert.equal(
        result[key],
        expected[key],
        `BUILD_OWNER_RESULT_${key}_MISMATCH`,
      );
  }
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.contractsExitCode, 0);
  assert.equal(receipt.freshDist, true);
  assert.equal(
    result.receiptSha256,
    digest(bytes),
    "BUILD_OWNER_RECEIPT_DIGEST_MISMATCH",
  );
  assert.deepEqual(
    JSON.parse(bytes.toString("utf8")),
    receipt,
    "BUILD_OWNER_RECEIPT_FILE_MISMATCH",
  );
  return result.receiptSha256;
}

export function requireOwnerSigner(privatePem) {
  const privateKey = createPrivateKey(privatePem);
  assert.equal(
    createPublicKey(privateKey)
      .export({ type: "spki", format: "der" })
      .equals(ownerKey.export({ type: "spki", format: "der" })),
    true,
    "BUILD_OWNER_SIGNER_IDENTITY_INVALID",
  );
  return privateKey;
}

function absent(path) {
  try {
    lstatSync(path);
    assert.fail("BUILD_OWNER_EXISTING_RECEIPT_OR_SIGNATURE");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/** Called only by --issue. The private key is read after both builds succeed. */
export function issueOwnerBuild(projectRoot = root, env = process.env) {
  const candidateSha = cleanCandidate(projectRoot);
  const leaseId = env.ISSUE300_R2_PROOF_LEASE_ID;
  assert.match(leaseId ?? "", leasePattern);
  assert.equal(env.NODE_ENV, "test");
  const ownerFolder = ownedLocation(projectRoot, issuerDirectory);
  const leasePath = join(
    ownerFolder,
    `W17_BUILD_LEASE_${candidateSha}_${leaseId}.json`,
  );
  const rawLease = loadExact(leasePath, ownerFolder, 4096);
  const leaseSignature = loadExact(`${leasePath}.sig`, ownerFolder, 256);
  const lease = verifiedOwnerLease(
    rawLease,
    leaseSignature.toString("utf8"),
    candidateSha,
    leaseId,
  );
  const canonicalRoot = realpathSync.native(projectRoot);
  mkdirSync(join(canonicalRoot, buildDirectory), {
    recursive: true,
    mode: 0o700,
  });
  const buildFolder = ownedLocation(projectRoot, buildDirectory);
  const receiptPath = join(
    buildFolder,
    `R2_API_BUILD_${candidateSha}_${leaseId}.json`,
  );
  absent(receiptPath);
  absent(`${receiptPath}.sig`);
  const derivedEnv = {
    ...env,
    NODE_ENV: "test",
    ISSUE300_R2_CANDIDATE_SHA: candidateSha,
    ISSUE300_R2_BUILD_LEASE_ENABLE: "OWNER_EXCLUSIVE_HEAVY_LEASE",
    ISSUE300_R2_PROOF_LEASE_ID: leaseId,
    ISSUE300_R2_BUILD_LEASE_EXPIRES_AT: lease.expiresAt,
  };
  const result = runBuildUnderLease(projectRoot, derivedEnv);
  let receipt = currentBuildEvidence(projectRoot, leaseId);
  let bytes = loadExact(receiptPath, buildFolder, 8192);
  assertBuildOutput(result, receipt, bytes, {
    candidateSha,
    leaseId,
    sourceSha256: result.sourceSha256,
    apiBundleSha256: result.apiBundleSha256,
    contractsBundleSha256: result.contractsBundleSha256,
  });
  const finalLease = verifiedOwnerLease(
    loadExact(leasePath, ownerFolder, 4096),
    loadExact(`${leasePath}.sig`, ownerFolder, 256).toString("utf8"),
    candidateSha,
    leaseId,
  );
  assert.equal(finalLease.sha256, lease.sha256, "BUILD_OWNER_LEASE_CHANGED");
  receipt = currentBuildEvidence(projectRoot, leaseId);
  bytes = loadExact(receiptPath, buildFolder, 8192);
  assertBuildOutput(result, receipt, bytes, {
    candidateSha,
    leaseId,
    sourceSha256: result.sourceSha256,
    apiBundleSha256: result.apiBundleSha256,
    contractsBundleSha256: result.contractsBundleSha256,
  });
  assert(
    Date.now() < lease.expiresAtMs,
    "BUILD_OWNER_LEASE_EXPIRED_BEFORE_SIGN",
  );
  const privatePem = loadExact(join(ownerFolder, issuerKey), ownerFolder, 8192);
  const privateKey = requireOwnerSigner(privatePem);
  const signature = sign(null, bytes, privateKey);
  assert.equal(signature.length, 64, "BUILD_OWNER_SIGNER_FAILED");
  const sidecar = `${receiptPath}.sig`;
  // Last write is the atomic verification marker; W17 must demand this sidecar.
  writeFileSync(sidecar, signature.toString("base64"), {
    flag: "wx",
    mode: 0o600,
  });
  verifyOwnerSignature(
    loadExact(receiptPath, buildFolder, 8192),
    loadExact(sidecar, buildFolder, 256).toString("utf8"),
  );
  currentBuildEvidence(projectRoot, leaseId);
  return {
    candidateSha,
    leaseId,
    receiptSha256: digest(bytes),
    sourceSha256: receipt.sourceSha256,
    apiBundleSha256: receipt.apiBundleSha256,
    contractsBundleSha256: receipt.contractsBundleSha256,
    signedReceipt: receiptPath,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.deepEqual(
      process.argv.slice(2),
      ["--issue"],
      "BUILD_OWNER_EXACT_MODE_REQUIRED",
    );
    console.log(JSON.stringify(issueOwnerBuild())); // Never emits credentials or key material.
  } catch (error) {
    console.error(`BUILD_OWNER_REFUSED:${error?.code ?? "CHECK_FAILED"}`);
    process.exitCode = 1;
  }
}
