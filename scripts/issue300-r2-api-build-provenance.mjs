/* global process, console, Buffer */
// Prime-only local API build receipt. Execution requires the Owner's exclusive lease.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { r2ApiBundleHash } from "./issue300-r2-api-bundle-hash.mjs";
import { contractsBundleHash } from "./issue300-r2-contracts-build-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ownedName = "tmp/issue300-r2-w17-build-owned";
const distName = "apps/api/dist";
const command = "pnpm --dir apps/api build";
const contractsDistName = "packages/contracts/dist";
const contractsCommand = "pnpm --dir packages/contracts build";
const hex40 = /^[a-f0-9]{40}$/;
const hex64 = /^[a-f0-9]{64}$/;
const leasePattern = /^issue300-r2-[a-z0-9-]{8,}$/;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const inputs = [
  "apps/api/src", "apps/api/tsconfig.json", "apps/api/tsconfig.build.json",
  "apps/api/package.json", "tsconfig.base.json", "pnpm-lock.yaml",
  "package.json", "pnpm-workspace.yaml", "packages/contracts",
  "packages/database", "packages/config",
];
const mandatory = [
  "apps/api/src/main.ts", "apps/api/tsconfig.json",
  "apps/api/tsconfig.build.json", "apps/api/package.json",
  "tsconfig.base.json", "pnpm-lock.yaml", "package.json",
  "pnpm-workspace.yaml",
];

function git(projectRoot, ...args) {
  return execFileSync("git", args, {
    cwd: projectRoot, encoding: "utf8", windowsHide: true,
  }).trim();
}

export function cleanCandidate(projectRoot = root) {
  const candidateSha = git(projectRoot, "rev-parse", "HEAD");
  assert.match(candidateSha, hex40, "BUILD_CANDIDATE_INVALID");
  assert.equal(git(projectRoot, "status", "--porcelain=v1"), "",
    "BUILD_SOURCE_DIRTY");
  return candidateSha;
}

function canonical(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function safeExisting(projectRoot, relativePath, file = false) {
  assert(typeof relativePath === "string" && relativePath.length > 0 &&
    !relativePath.includes("\\") && !relativePath.includes("\0"),
  "BUILD_PATH_INVALID");
  const parts = relativePath.split("/");
  assert(parts.every((part) => part && part !== "." && part !== ".."),
    "BUILD_PATH_TRAVERSAL");
  // Windows may provide a genuine 8.3 short path for the temp root. Canonicalize
  // the root once, then forbid links and reparse hops beneath that root.
  const base = realpathSync.native(resolve(projectRoot));
  let current = base;
  for (const part of parts) {
    current = join(current, part);
    const stat = lstatSync(current);
    assert(!stat.isSymbolicLink() &&
      canonical(realpathSync.native(current)) === canonical(current),
    "BUILD_PATH_REPARSE_DENIED");
  }
  if (file) assert(lstatSync(current).isFile(), "BUILD_EXPECTED_FILE");
  return current;
}

export function fingerprintSource(projectRoot, tracked) {
  assert(Array.isArray(tracked) && tracked.length >= mandatory.length,
    "BUILD_SOURCE_INVENTORY_EMPTY");
  const sorted = [...tracked].sort();
  assert.equal(new Set(sorted).size, sorted.length, "BUILD_SOURCE_DUPLICATE");
  for (const required of mandatory)
    assert(sorted.includes(required), `BUILD_SOURCE_REQUIRED:${required}`);
  const digest = createHash("sha256");
  for (const name of sorted) {
    assert(inputs.some((prefix) => name === prefix || name.startsWith(`${prefix}/`)),
      "BUILD_SOURCE_OUTSIDE_SCOPE");
    const path = safeExisting(projectRoot, name, true);
    const stat = lstatSync(path);
    assert(stat.nlink === 1, "BUILD_SOURCE_HARDLINK_DENIED");
    digest.update(name).update("\0").update(readFileSync(path)).update("\0");
  }
  return { sourceSha256: digest.digest("hex"), sourceFiles: sorted.length };
}

export function sourceSnapshot(projectRoot = root) {
  const buffer = execFileSync("git", ["ls-files", "-z", "--", ...inputs], {
    cwd: projectRoot, windowsHide: true,
  });
  const tracked = buffer.toString("utf8").split("\0").filter(Boolean);
  return fingerprintSource(projectRoot, tracked);
}

export function validateLease(env, candidateSha, now = Date.now()) {
  assert.equal(env.NODE_ENV, "test", "BUILD_NON_TEST_DENIED");
  assert.equal(env.ISSUE300_R2_BUILD_LEASE_ENABLE, "OWNER_EXCLUSIVE_HEAVY_LEASE",
    "BUILD_EXCLUSIVE_LEASE_REQUIRED");
  assert.match(env.ISSUE300_R2_PROOF_LEASE_ID ?? "", leasePattern,
    "BUILD_LEASE_INVALID");
  assert.equal(env.ISSUE300_R2_CANDIDATE_SHA, candidateSha,
    "BUILD_CANDIDATE_LEASE_MISMATCH");
  const deadline = Date.parse(env.ISSUE300_R2_BUILD_LEASE_EXPIRES_AT ?? "");
  assert(Number.isFinite(deadline) && deadline > now &&
    deadline <= now + 15 * 60_000, "BUILD_LEASE_EXPIRED_OR_UNBOUNDED");
  return { leaseId: env.ISSUE300_R2_PROOF_LEASE_ID, deadline };
}

export function buildReceipt({ before, after, outcome, contractsOutcome,
  bundleSha256, contractsBundleSha256, leaseId, startedAt, finishedAt,
  sourceFiles, freshDist }) {
  assert(freshDist === true, "BUILD_OLD_DIST_PRESENT");
  assert(outcome?.status === 0 && outcome.error == null &&
    outcome.signal == null && outcome.timedOut !== true,
  "BUILD_PNPM_NOT_SUCCESSFUL");
  assert(contractsOutcome?.status === 0 && contractsOutcome.error == null &&
    contractsOutcome.signal == null && contractsOutcome.timedOut !== true,
  "BUILD_CONTRACTS_PNPM_NOT_SUCCESSFUL");
  assert.match(before.candidateSha, hex40);
  assert.equal(after.candidateSha, before.candidateSha,
    "BUILD_HEAD_CHANGED");
  assert.deepEqual(after.source, before.source, "BUILD_SOURCE_CHANGED");
  assert.match(before.source.sourceSha256, hex64);
  assert.equal(before.source.sourceFiles, sourceFiles);
  assert.match(bundleSha256, hex64, "BUILD_OUTPUT_MISSING");
  assert.match(contractsBundleSha256, hex64,
    "BUILD_CONTRACTS_OUTPUT_MISSING");
  assert.match(leaseId, leasePattern);
  assert(Number.isFinite(startedAt) && Number.isFinite(finishedAt) &&
    finishedAt >= startedAt, "BUILD_TIME_INVALID");
  return {
    version: 1, candidateSha: before.candidateSha,
    sourceSha256: before.source.sourceSha256, sourceFiles,
    apiBundleSha256: bundleSha256, contractsBundleSha256,
    command, contractsCommand, exitCode: 0, contractsExitCode: 0,
    freshDist: true, leaseId,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
  };
}

export function verifyBuildReceipt(receipt, { candidateSha, source,
  bundleSha256, contractsBundleSha256, leaseId }) {
  assert(receipt && typeof receipt === "object" &&
    Object.keys(receipt).sort().join("|") === [
      "apiBundleSha256", "candidateSha", "command", "contractsBundleSha256",
      "contractsCommand", "contractsExitCode", "exitCode", "finishedAt",
      "freshDist", "leaseId", "sourceFiles", "sourceSha256", "startedAt", "version",
    ].sort().join("|"), "BUILD_RECEIPT_SCHEMA_DENIED");
  assert.equal(receipt.version, 1);
  assert.equal(receipt.command, command);
  assert.equal(receipt.contractsCommand, contractsCommand);
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.contractsExitCode, 0);
  assert.equal(receipt.freshDist, true);
  assert.match(receipt.candidateSha, hex40);
  assert.match(receipt.apiBundleSha256, hex64);
  assert.match(receipt.contractsBundleSha256, hex64);
  assert.match(receipt.sourceSha256, hex64);
  assert.match(receipt.leaseId, leasePattern);
  assert.equal(receipt.candidateSha, candidateSha, "BUILD_RECEIPT_STALE_HEAD");
  assert.equal(receipt.leaseId, leaseId, "BUILD_RECEIPT_FOREIGN_LEASE");
  assert.equal(receipt.sourceSha256, source.sourceSha256,
    "BUILD_RECEIPT_SOURCE_SWAP");
  assert.equal(receipt.sourceFiles, source.sourceFiles,
    "BUILD_RECEIPT_SOURCE_FILES_CHANGED");
  assert.equal(receipt.apiBundleSha256, bundleSha256,
    "BUILD_RECEIPT_OUTPUT_SWAP");
  assert.equal(receipt.contractsBundleSha256, contractsBundleSha256,
    "BUILD_RECEIPT_CONTRACTS_OUTPUT_SWAP");
  const start = Date.parse(receipt.startedAt);
  const finish = Date.parse(receipt.finishedAt);
  assert(Number.isFinite(start) && Number.isFinite(finish) &&
    finish >= start, "BUILD_RECEIPT_TIMES_INVALID");
  return receipt.apiBundleSha256;
}

function receiptPath(projectRoot, candidateSha, leaseId, create = false) {
  assert.match(candidateSha, hex40);
  assert.match(leaseId, leasePattern);
  const tmp = join(projectRoot, "tmp");
  if (existsSync(tmp)) safeExisting(projectRoot, "tmp");
  const folder = join(projectRoot, ownedName);
  if (create) mkdirSync(folder, { recursive: true, mode: 0o700 });
  safeExisting(projectRoot, ownedName);
  return join(folder, `R2_API_BUILD_${candidateSha}_${leaseId}.json`);
}

export function currentBuildEvidence(projectRoot, leaseId) {
  const candidateSha = cleanCandidate(projectRoot);
  const source = sourceSnapshot(projectRoot);
  const path = receiptPath(projectRoot, candidateSha, leaseId);
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    stat.size > 0 && stat.size <= 8192, "BUILD_RECEIPT_UNSAFE_FILE");
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  const bundleSha256 = r2ApiBundleHash(
    safeExisting(projectRoot, distName));
  const contractsBundleSha256 = contractsBundleHash(
    safeExisting(projectRoot, contractsDistName));
  verifyBuildReceipt(receipt, { candidateSha, source, bundleSha256,
    contractsBundleSha256, leaseId });
  assert.equal(cleanCandidate(projectRoot), candidateSha, "BUILD_HEAD_CHANGED");
  assert.deepEqual(sourceSnapshot(projectRoot), source, "BUILD_SOURCE_CHANGED");
  assert.equal(r2ApiBundleHash(safeExisting(projectRoot, distName)),
    bundleSha256, "BUILD_OUTPUT_CHANGED_DURING_CHECK");
  assert.equal(contractsBundleHash(safeExisting(projectRoot, contractsDistName)),
    contractsBundleSha256, "BUILD_CONTRACTS_CHANGED_DURING_CHECK");
  return receipt;
}

function leasedBuild(projectRoot, args, deadline) {
  const remaining = deadline - Date.now();
  assert(remaining > 0, "BUILD_LEASE_EXPIRED_BEFORE_COMPILATION");
  const result = spawnSync("pnpm", args, {
    cwd: projectRoot, windowsHide: true, stdio: "ignore",
    shell: process.platform === "win32", timeout: remaining,
  });
  assert(result.status === 0 && result.error == null && !result.signal &&
    Date.now() < deadline, "BUILD_COMPILATION_FAILED_OR_EXPIRED");
  return result;
}

function requireAbsentDist(projectRoot, name) {
  // existsSync misses broken symlinks: lstat must prove even those are absent.
  try {
    lstatSync(join(projectRoot, name));
    assert.fail("BUILD_OLD_DIST_PRESENT_MOVE_TO_OWNED_BACKUP_FIRST");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function runBuildUnderLease(projectRoot = root, env = process.env) {
  const candidateSha = cleanCandidate(projectRoot);
  const lease = validateLease(env, candidateSha);
  requireAbsentDist(projectRoot, distName);
  requireAbsentDist(projectRoot, contractsDistName);
  const source = sourceSnapshot(projectRoot);
  const startedAt = Date.now();
  const before = { candidateSha, source };
  const contractsOutcome = leasedBuild(projectRoot,
    ["--dir", "packages/contracts", "build"], lease.deadline);
  const result = leasedBuild(projectRoot,
    ["--dir", "apps/api", "build"], lease.deadline);
  const finishedAt = Date.now();
  assert(finishedAt < lease.deadline, "BUILD_LEASE_EXPIRED_DURING_BUILD");
  const after = { candidateSha: cleanCandidate(projectRoot),
    source: sourceSnapshot(projectRoot) };
  const bundleSha256 = r2ApiBundleHash(safeExisting(projectRoot, distName));
  const contractsBundleSha256 = contractsBundleHash(
    safeExisting(projectRoot, contractsDistName));
  const receipt = buildReceipt({ before, after, outcome: result, contractsOutcome,
    bundleSha256, contractsBundleSha256,
    leaseId: lease.leaseId, startedAt, finishedAt,
    sourceFiles: source.sourceFiles, freshDist: true });
  const path = receiptPath(projectRoot, candidateSha, lease.leaseId, true);
  const bytes = Buffer.from(JSON.stringify(receipt));
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  currentBuildEvidence(projectRoot, lease.leaseId);
  return { path, candidateSha, sourceSha256: source.sourceSha256,
    apiBundleSha256: bundleSha256, contractsBundleSha256,
    receiptSha256: sha(bytes) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(process.argv.length === 3 &&
      ["--build-under-lease", "--verify"].includes(process.argv[2]),
    "BUILD_EXPECTED_EXACT_MODE");
    const result = process.argv[2] === "--build-under-lease"
      ? runBuildUnderLease()
      : (() => {
        const candidateSha = cleanCandidate(root);
        const { leaseId } = validateLease(process.env, candidateSha);
        const receipt = currentBuildEvidence(root, leaseId);
        return { candidateSha, sourceSha256: receipt.sourceSha256,
          apiBundleSha256: receipt.apiBundleSha256 };
      })();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`BUILD_PROVENANCE_REFUSED:${error?.code ?? "CHECK_FAILED"}`);
    process.exitCode = 1;
  }
}
