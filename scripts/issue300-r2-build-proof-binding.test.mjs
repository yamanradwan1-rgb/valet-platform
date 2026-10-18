import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  assertBuildBinding, assertManifestBuildBinding, receiptBinding,
  readBoundReceiptFile,
} from "./issue300-r2-build-proof-binding.mjs";
import {
  assertOwnerBuildLease, requireSignedBuildLease,
} from "./issue300-r2-owner-build-lease.mjs";
import { verifyBuildOwnerSignature } from "./issue300-r2-owner-build-signature.mjs";
import { runCli } from "./issue300-r2-v2-manifest-and-ledger.mjs";

const root = mkdtempSync(join(tmpdir(), "issue300-build-bound-"));
after(() => rmSync(root, { recursive: true, force: true }));
const folder = join(root, "tmp/issue300-r2-w17-build-owned");
mkdirSync(folder, { recursive: true });
const leaseFolder = join(root, "tmp/issue300-r2-v2-prime-owned");
mkdirSync(leaseFolder, { recursive: true });
const candidateSha = "a".repeat(40);
const leaseId = "issue300-r2-w17-signed-fixture-lease";
const hash = (char) => char.repeat(64);
const now = Date.parse("2026-10-19T00:01:15Z");
const receipt = {
  version: 1, candidateSha, leaseId, sourceSha256: hash("c"),
  sourceFiles: 10, apiBundleSha256: hash("d"),
  contractsBundleSha256: hash("e"),
  command: "pnpm --dir apps/api build",
  contractsCommand: "pnpm --dir packages/contracts build",
  exitCode: 0, contractsExitCode: 0, freshDist: true,
  startedAt: new Date(now - 30000).toISOString(),
  finishedAt: new Date(now - 10000).toISOString(),
};
const lease = {
  version: 1, purpose: "ISSUE300_R2_OWNER_BUILD_LEASE",
  candidateSha, leaseId,
  issuedAt: new Date(now - 60000).toISOString(),
  expiresAt: new Date(now + 5 * 60000).toISOString(),
};
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signBytes = (bytes) => sign(null, bytes, privateKey).toString("base64");
const verifyFixture = (bytes, encoded) =>
  verifyBuildOwnerSignature(bytes, encoded, publicKey);
const receiptPath = join(folder, `R2_API_BUILD_${candidateSha}_${leaseId}.json`);
const leasePath = join(leaseFolder, `W17_BUILD_LEASE_${candidateSha}_${leaseId}.json`);

function writePair(path, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  writeFileSync(path, bytes);
  writeFileSync(`${path}.sig`, signBytes(bytes));
}
function writeFixture() {
  writePair(receiptPath, receipt);
  writePair(leasePath, lease);
}

test("fresh test-only signed fixture binds source, both output trees and raw receipt digest", () => {
  writeFixture();
  const bound = readBoundReceiptFile(root, candidateSha, leaseId,
    receipt, verifyFixture);
  assert.match(bound.apiBuildReceiptSha256, /^[a-f0-9]{64}$/);
  assert.equal(bound.sourceSha256, receipt.sourceSha256);
  assert.equal(bound.apiBundleSha256, receipt.apiBundleSha256);
  assert.equal(bound.contractsBundleSha256, receipt.contractsBundleSha256);
  assert.equal(assertManifestBuildBinding({ ...bound }, bound), bound);
  assert.equal(requireSignedBuildLease(root, receipt, now, verifyFixture), true);
});

test("missing, unsigned, forged and replaced build receipts are always rejected", () => {
  writeFixture();
  rmSync(`${receiptPath}.sig`);
  assert.throws(() =>
    readBoundReceiptFile(root, candidateSha, leaseId, receipt, verifyFixture));
  writePair(receiptPath, receipt);
  writeFileSync(receiptPath, JSON.stringify({ ...receipt, exitCode: 1 }));
  assert.throws(() =>
    readBoundReceiptFile(root, candidateSha, leaseId, receipt, verifyFixture),
  /BUILD_OWNER_SIGNATURE_UNTRUSTED/);
  writePair(receiptPath, receipt);
  const forged = { ...receipt, exitCode: 0, sourceSha256: hash("f") };
  writeFileSync(receiptPath, JSON.stringify(forged));
  // Even a matching unsigned JSON cannot pass the pinned Owner signature.
  assert.throws(() =>
    readBoundReceiptFile(root, candidateSha, leaseId, forged, verifyFixture));
  writePair(receiptPath, receipt);
  assert.throws(() => readBoundReceiptFile(root,
    "f".repeat(40), leaseId, receipt, verifyFixture));
  assert.throws(() => receiptBinding(receipt,
    Buffer.from(JSON.stringify(receipt) + " "), candidateSha, leaseId),
  /ISSUE300_BUILD_RECEIPT_NONCANONICAL/);
  assert.equal(readFileSync(receiptPath, "utf8"), JSON.stringify(receipt));
});

test("Owner trust pin refuses self-signed receipt under a different key", () => {
  writeFixture();
  const bytes = readFileSync(receiptPath);
  const forgedByOtherKey = signBytes(bytes);
  assert.throws(() => verifyBuildOwnerSignature(bytes, forgedByOtherKey),
    /BUILD_OWNER_SIGNATURE_UNTRUSTED/);
  assert.throws(() => verifyBuildOwnerSignature(bytes, ""),
    /BUILD_OWNER_SIGNATURE_MISSING_OR_MALFORMED/);
});

test("source, API, contracts, receipt digest and scope/lease mismatches block manifest", () => {
  const bound = readBoundReceiptFile(root, candidateSha, leaseId,
    receipt, verifyFixture);
  for (const field of ["sourceSha256", "apiBundleSha256",
    "contractsBundleSha256", "apiBuildReceiptSha256"]) {
    assert.throws(() =>
      assertManifestBuildBinding({ ...bound, [field]: hash("0") }, bound),
    /ISSUE300_MANIFEST_BUILD/);
  }
  for (const changes of [
    { candidateSha: "f".repeat(40) },
    { leaseId: "issue300-r2-foreign-scope-lease" },
  ]) assert.throws(() => assertBuildBinding({
    ...bound, ...changes,
  }, candidateSha, leaseId));
  assert.throws(() => assertBuildBinding({
    ...bound, extraUntrustedScope: "foreign",
  }, candidateSha, leaseId), /ISSUE300_BUILD_BINDING_SCHEMA/);
});

test("independent signed Owner lease rejects expiry, wrong identity or schema", () => {
  assert.equal(assertOwnerBuildLease(lease, receipt, now), true);
  for (const bad of [
    { version: 2 },
    { purpose: "ISSUE300_R2_UNOWNED_LEASE" },
    { leaseId: "issue300-r2-foreign-lease" },
    { candidateSha: "f".repeat(40) },
    { arbitraryCommands: ["pnpm --dir apps/api build"] },
    { issuedAt: new Date(now + 30000).toISOString() },
    { expiresAt: new Date(now - 1).toISOString() },
    { expiresAt: new Date(now + 2 * 60 * 60000).toISOString() },
  ]) assert.throws(() => assertOwnerBuildLease({ ...lease, ...bad }, receipt, now));
  writeFixture();
  rmSync(`${leasePath}.sig`);
  assert.throws(() => requireSignedBuildLease(root, receipt, now, verifyFixture));
  writePair(leasePath, lease);
  writeFileSync(leasePath, JSON.stringify({ ...lease, version: 2 }));
  assert.throws(() => requireSignedBuildLease(root, receipt, now, verifyFixture));
});

test("prepare-source also fails closed without explicit lease and verified build", async () => {
  await assert.rejects(runCli(["--prepare-source"], {}),
    /AssertionError|ERR_ASSERTION/);
  await assert.rejects(runCli(["--issue"], {}),
    /AssertionError|ERR_ASSERTION/);
});
