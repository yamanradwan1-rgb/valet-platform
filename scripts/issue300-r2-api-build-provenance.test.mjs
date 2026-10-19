import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { linkSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import {
  fingerprintSource, validateLease, buildReceipt, verifyBuildReceipt,
} from "./issue300-r2-api-build-provenance.mjs";
import { contractsBundleHash } from "./issue300-r2-contracts-build-hash.mjs";
import { r2ApiBundleHash } from "./issue300-r2-api-bundle-hash.mjs";

test("compiled API digest refuses externally writable hardlinked modules", () => {
  const dist = join(tmp, "api-hardlink-dist");
  mkdirSync(dist, { recursive: true });
  const main = join(dist, "main.js");
  const copied = join(tmp, "external-hardlink.js");
  writeFileSync(main, "module.exports = {};");
  assert.match(r2ApiBundleHash(dist), /^[a-f0-9]{64}$/);
  linkSync(main, copied);
  assert.throws(() => r2ApiBundleHash(dist), /Hard-linked API artifact denied/);
});

const tmp = mkdtempSync(join(tmpdir(), "issue300-build-receipt-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const tracked = [
  "apps/api/src/main.ts", "apps/api/src/app.ts",
  "apps/api/tsconfig.json", "apps/api/tsconfig.build.json",
  "apps/api/package.json", "tsconfig.base.json", "pnpm-lock.yaml",
  "package.json", "pnpm-workspace.yaml", "packages/contracts/src/index.ts",
];
for (const name of tracked) {
  const path = join(tmp, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `sample ${name}`);
}
const candidateSha = "a".repeat(40);
const leaseId = "issue300-r2-w17-prime-owner-lease";
const bundleSha256 = "b".repeat(64);
const contractsBundleSha256 = "e".repeat(64);
const startedAt = Date.parse("2026-10-19T00:01:00Z");
const finishedAt = startedAt + 6000;
const source = () => fingerprintSource(tmp, tracked);
const state = () => ({ candidateSha, source: source() });
const outcome = { status: 0, error: undefined, signal: null };

function success(overrides = {}) {
  return buildReceipt({ before: state(), after: state(), outcome, contractsOutcome: outcome,
    bundleSha256, contractsBundleSha256, leaseId, startedAt, finishedAt,
    sourceFiles: tracked.length, freshDist: true, ...overrides });
}

test("binds named API source, inherited tsconfig, workspace inputs and lock content", () => {
  const original = source();
  assert.equal(original.sourceFiles, tracked.length);
  assert.match(original.sourceSha256, /^[a-f0-9]{64}$/);
  const lock = join(tmp, "pnpm-lock.yaml");
  const previous = readFileSync(lock);
  writeFileSync(lock, "tampered lock");
  assert.notEqual(source().sourceSha256, original.sourceSha256);
  writeFileSync(lock, previous);
  const base = join(tmp, "tsconfig.base.json");
  const config = readFileSync(base);
  writeFileSync(base, "different config");
  assert.notEqual(source().sourceSha256, original.sourceSha256);
  writeFileSync(base, config);
  assert.deepEqual(source(), original);
});

test("missing, duplicate, traversing, escaping or symlinked sources fail closed", async () => {
  assert.throws(() => fingerprintSource(tmp, tracked.slice(1)),
    /BUILD_SOURCE_REQUIRED/);
  assert.throws(() => fingerprintSource(tmp, [...tracked, tracked[0]]),
    /BUILD_SOURCE_DUPLICATE/);
  assert.throws(() => fingerprintSource(tmp, [...tracked, "../other"]),
    /BUILD_SOURCE_OUTSIDE_SCOPE/);
  assert.throws(() => fingerprintSource(tmp, [...tracked, "apps/api/src/../fake.ts"]));
  const { symlinkSync } = await import("node:fs");
  const external = join(tmp, "external.ts");
  const link = join(tmp, "apps/api/src/sneaky.ts");
  writeFileSync(external, "bad");
  try {
    symlinkSync(external, link, "file");
    assert.throws(() => fingerprintSource(tmp, [...tracked, "apps/api/src/sneaky.ts"]),
      /BUILD_PATH_REPARSE_DENIED/);
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
  }
});

test("lease enforces explicit test, final candidate, owner, bounded expiry", () => {
  const env = {
    NODE_ENV: "test", ISSUE300_R2_CANDIDATE_SHA: candidateSha,
    ISSUE300_R2_PROOF_LEASE_ID: leaseId,
    ISSUE300_R2_BUILD_LEASE_ENABLE: "OWNER_EXCLUSIVE_HEAVY_LEASE",
    ISSUE300_R2_BUILD_LEASE_EXPIRES_AT: new Date(startedAt + 12 * 60000).toISOString(),
  };
  assert.equal(validateLease(env, candidateSha, startedAt).leaseId, leaseId);
  for (const change of [
    { NODE_ENV: "production" },
    { ISSUE300_R2_CANDIDATE_SHA: "c".repeat(40) },
    { ISSUE300_R2_PROOF_LEASE_ID: "wrong" },
    { ISSUE300_R2_BUILD_LEASE_ENABLE: "GRANTED" },
    { ISSUE300_R2_BUILD_LEASE_EXPIRES_AT: new Date(startedAt).toISOString() },
    { ISSUE300_R2_BUILD_LEASE_EXPIRES_AT: new Date(startedAt + 60 * 60000).toISOString() },
  ]) assert.throws(() => validateLease({ ...env, ...change }, candidateSha, startedAt));
});

test("successful empty-tree pnpm result creates a bounded provenance receipt", () => {
  const receipt = success();
  assert.deepEqual(Object.keys(receipt).sort(), [
    "apiBundleSha256", "candidateSha", "command", "contractsBundleSha256",
    "contractsCommand", "contractsExitCode", "exitCode", "finishedAt",
    "freshDist", "leaseId", "sourceFiles", "sourceSha256", "startedAt", "version",
  ].sort());
  assert.equal(receipt.command, "pnpm --dir apps/api build");
  assert.equal(receipt.contractsCommand, "pnpm --dir packages/contracts build");
  assert.equal(verifyBuildReceipt(receipt, { candidateSha, source: source(),
    bundleSha256, contractsBundleSha256, leaseId }), bundleSha256);
  assert(!JSON.stringify(receipt).includes("password"));
});

test("missing/unbuilt/out-of-lease/stale build cannot mint receipt", () => {
  for (const value of [
    { freshDist: false },
    { outcome: { status: 1, signal: null } },
    { contractsOutcome: { status: 1, signal: null } },
    { outcome: { status: null, signal: "SIGTERM" } },
    { outcome: { status: 0, error: new Error("pnpm missing") } },
    { outcome: { status: 0, timedOut: true } },
    { bundleSha256: "not-sha" },
    { contractsBundleSha256: "not-sha" },
    { after: { ...state(), candidateSha: "d".repeat(40) } },
    { after: { ...state(), source: { sourceSha256: "c".repeat(64), sourceFiles: 10 } } },
    { finishedAt: startedAt - 1 },
  ]) assert.throws(() => success(value));
});

test("receipt verification rejects replay to another SHA, lease, source or output", () => {
  const receipt = success();
  const expected = { candidateSha, source: source(), bundleSha256,
    contractsBundleSha256, leaseId };
  for (const value of [
    { candidateSha: "f".repeat(40) },
    { leaseId: "issue300-r2-another-owner-lease" },
    { source: { ...expected.source, sourceSha256: "f".repeat(64) } },
    { source: { ...expected.source, sourceFiles: 99 } },
    { bundleSha256: "c".repeat(64) },
    { contractsBundleSha256: "d".repeat(64) },
  ]) assert.throws(() => verifyBuildReceipt(receipt, { ...expected, ...value }));
  for (const value of [
    { freshDist: false }, { exitCode: 1 }, { command: "echo success" },
    { contractsExitCode: 1 }, { contractsCommand: "echo success" },
    { finishedAt: "bad timestamp" }, { arbitraryField: 1 },
  ]) assert.throws(() => verifyBuildReceipt({ ...receipt, ...value }, expected));
});

test("compiled output fingerprint changes if a compiled JS file is swapped", () => {
  const original = Buffer.from("compiled A");
  const swapped = Buffer.from("compiled B");
  assert.notEqual(createHash("sha256").update(original).digest("hex"),
    createHash("sha256").update(swapped).digest("hex"));
  assert.throws(() => verifyBuildReceipt(success(), {
    candidateSha, source: source(), leaseId, contractsBundleSha256,
    bundleSha256: createHash("sha256").update(swapped).digest("hex"),
  }), /BUILD_RECEIPT_OUTPUT_SWAP/);
});

test("complete contracts output hash detects nested artifact and entrypoint swaps", () => {
  const base = join(tmp, "compiled-contracts");
  mkdirSync(join(base, "nested"), { recursive: true });
  const entry = join(base, "index.js");
  const nested = join(base, "nested", "schema.js");
  writeFileSync(entry, "module.exports = 1");
  writeFileSync(nested, "module.exports = 2");
  const first = contractsBundleHash(base);
  writeFileSync(nested, "module.exports = 3");
  assert.notEqual(contractsBundleHash(base), first);
  writeFileSync(entry, "module.exports = 4");
  assert.notEqual(contractsBundleHash(base), first);
  rmSync(entry);
  assert.throws(() => contractsBundleHash(base),
    /BUILD_CONTRACTS_ENTRYPOINT_MISSING/);
});
