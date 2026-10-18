/* global process, console, Buffer, URL */
// Prime-only V2 source receipt and expressly leased manifest issuance.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expectedLedgerFromSource, expectedLedgerDigest, installOwnedV2LedgerHelper,
  validateOwnerTarget, verifyOwnedDocker, v2LedgerTarget,
} from "./issue300-r2-v2-ledger-helper.mjs";
import { attestV2LedgerHelper } from "./issue300-r2-v2-ledger-issuer.mjs";
import { r2ApiBundleHash } from "./issue300-r2-api-bundle-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const owned = join(root, "tmp/issue300-r2-w7-acceptance-v2-owned");
const preparedName = "R2_PREPARED_SOURCE.json";
const manifestName = "R2_OWNED_RESOURCE_MANIFEST.json";
const hex = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;
const leasePattern = /^issue300-r2-[a-z0-9-]{8,}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixed = Object.freeze({
  database: v2LedgerTarget.database, host: v2LedgerTarget.host,
  port: v2LedgerTarget.port, bindHost: v2LedgerTarget.host,
  bindPort: v2LedgerTarget.port, serverVersionNum: v2LedgerTarget.serverVersionNum,
  apiOrigin: "http://127.0.0.1:3167",
  defaultApiOrigin: "http://127.0.0.1:3168",
  dashboardOrigin: "http://127.0.0.1:3117",
  containerName: v2LedgerTarget.containerName,
  containerLabel: v2LedgerTarget.label, volume: v2LedgerTarget.volume,
  migrationRole: v2LedgerTarget.migrationRole,
  runtimeRole: v2LedgerTarget.runtimeRole,
});

function gitOutput(...args) {
  return execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }).trim();
}
function cleanHead() {
  assert.equal(gitOutput("status", "--porcelain=v1"), "",
    "V2_REQUIRES_COMMITTED_CLEAN_SOURCE");
  const candidateSha = gitOutput("rev-parse", "HEAD");
  assert.match(candidateSha, gitSha);
  return candidateSha;
}
function safeOwnedPath(name) {
  assert([preparedName, manifestName].includes(name));
  // The only permitted output directory is ignored inside THIS worktree.
  const tmp = join(root, "tmp");
  if (existsSync(tmp)) assert(!lstatSync(tmp).isSymbolicLink() &&
    realpathSync.native(tmp).toLowerCase() === resolve(tmp).toLowerCase(),
  "V2_TASK_TMP_REPARSE_DENIED");
  mkdirSync(owned, { recursive: true, mode: 0o700 });
  assert(!lstatSync(owned).isSymbolicLink() &&
    realpathSync.native(owned).toLowerCase() === resolve(owned).toLowerCase(),
  "V2_OWNED_FOLDER_REPARSE_DENIED");
  const path = join(owned, name);
  if (existsSync(path)) assert(lstatSync(path).isFile() &&
    !lstatSync(path).isSymbolicLink() && lstatSync(path).nlink === 1,
  "V2_OWNED_FILE_ALIAS_DENIED");
  return path;
}
/** The same candidate/lease can retry safely, but changing any attested
 * resource requires a new explicit owner reconciliation, never overwrite. */
export function assertImmutableReplay(previousBytes, nextBytes) {
  assert(Buffer.isBuffer(previousBytes) && Buffer.isBuffer(nextBytes) &&
    previousBytes.equals(nextBytes),
  "V2_IMMUTABLE_RECORD_MISMATCH_NEVER_OVERWRITE");
}
function immutableJson(name, record) {
  const bytes = Buffer.from(JSON.stringify(record));
  assert(bytes.length > 0 && bytes.length <= 20_480, "V2_RECORD_OVERSIZE");
  const path = safeOwnedPath(name);
  if (existsSync(path)) {
    assertImmutableReplay(readFileSync(path), bytes);
    return { path, sha256: hash(bytes), reused: true };
  }
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  return { path, sha256: hash(bytes), reused: false };
}
function readPrepared() {
  const bytes = readFileSync(safeOwnedPath(preparedName));
  assert(bytes.length > 0 && bytes.length <= 20_480);
  return JSON.parse(bytes.toString("utf8"));
}

export function prepareSourceRecord(candidateSha, apiBundleSha256, checksums) {
  assert.match(candidateSha, gitSha);
  assert.match(apiBundleSha256, hex);
  const migrationLedgerSha256 = expectedLedgerDigest(checksums);
  return { candidateSha, apiBundleSha256,
    migrationLedgerSha256, migrationChecksums: checksums };
}
export function assertLease(env) {
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.ISSUE300_R2_V2_MANIFEST_ENABLE, "ISSUE_EXACT_OWNED_V2");
  assert.match(env.ISSUE300_R2_PROOF_LEASE_ID ?? "", leasePattern);
  assert.match(env.ISSUE300_R2_CANDIDATE_SHA ?? "", gitSha);
  return env.ISSUE300_R2_PROOF_LEASE_ID;
}
function validateConnection(raw, role) {
  let url;
  try { url = new URL(raw ?? ""); }
  catch { throw Error("V2_DATABASE_TARGET_DENIED"); }
  assert(url.protocol === "postgresql:" && url.hostname === fixed.host &&
    url.port === String(fixed.port) && url.pathname === `/${fixed.database}` &&
    decodeURIComponent(url.username) === role && !!url.password &&
    !url.search && !url.hash, "V2_DATABASE_TARGET_DENIED");
  return url.href;
}
function assertSourceFresh(prepared, fresh) {
  assert.deepEqual(prepared, fresh, "V2_PREPARED_SOURCE_STALE");
}
export function assembleOwnedManifest(prepared, docker, identity, rows, leaseId) {
  assert.match(leaseId, leasePattern);
  assert.match(docker?.Id ?? "", hex, "V2_CONTAINER_ID_DENIED");
  assert(identity?.database === fixed.database &&
    identity?.role === fixed.migrationRole &&
    identity?.login === fixed.migrationRole &&
    Number(identity?.version) === fixed.serverVersionNum &&
    identity?.replica === false, "V2_OWNER_DB_IDENTITY_DENIED");
  const postgresStartedAt = new Date(identity.started).toISOString();
  assert(Array.isArray(rows) && rows.length === 96, "V2_LEDGER_COUNT_DENIED");
  assert(rows.every((row) => row.finished_at && !row.rolled_back_at &&
    prepared.migrationChecksums[row.migration_name] === row.checksum) &&
    new Set(rows.map((row) => row.migration_name)).size === 96,
  "V2_LIVE_MIGRATION_MISMATCH");
  const manifest = { ...fixed, containerId: docker?.Id,
    candidateSha: prepared.candidateSha, leaseId, postgresStartedAt,
    apiBundleSha256: prepared.apiBundleSha256,
    migrationChecksums: prepared.migrationChecksums };
  verifyOwnedDocker(manifest, docker);
  return manifest;
}

/** Injected clients only: source-only tests MUST NOT open a database.
 * Existing, independently inspected helper is reusable; NEVER REPLACE it. */
export async function issueWithClients({
  prepared, fresh, env, docker, admin, runtime,
  ownerDatabaseUrl, install = installOwnedV2LedgerHelper,
  attest = attestV2LedgerHelper, publish = (value) => immutableJson(manifestName, value),
}) {
  const leaseId = assertLease(env);
  assertSourceFresh(prepared, fresh);
  validateConnection(ownerDatabaseUrl, fixed.migrationRole);
  assert(admin?.connectionParameters?.host === fixed.host &&
    Number(admin.connectionParameters.port) === fixed.port &&
    admin.connectionParameters.database === fixed.database &&
    admin.connectionParameters.user === fixed.migrationRole,
  "V2_OWNER_CLIENT_DENIED");
  assert(runtime?.connectionParameters?.host === fixed.host &&
    Number(runtime.connectionParameters.port) === fixed.port &&
    runtime.connectionParameters.database === fixed.database &&
    runtime.connectionParameters.user === fixed.runtimeRole,
  "V2_RUNTIME_CLIENT_DENIED");
  // Check Docker BEFORE even the first read-only SQL.
  verifyOwnedDocker({ containerId: docker?.Id }, docker);
  await admin.query("BEGIN READ ONLY");
  let identity, history;
  try {
    identity = (await admin.query(`SELECT current_database() AS database,
      current_user AS role, session_user AS login,
      current_setting('server_version_num')::int AS version,
      pg_is_in_recovery() AS replica, pg_postmaster_start_time() AS started`)).rows[0];
    assert(identity?.database === fixed.database &&
      identity?.role === fixed.migrationRole &&
      identity?.login === fixed.migrationRole &&
      Number(identity?.version) === fixed.serverVersionNum &&
      identity?.replica === false, "V2_OWNER_DB_IDENTITY_DENIED");
    history = (await admin.query(`SELECT migration_name, checksum, finished_at,
      rolled_back_at FROM public._prisma_migrations`)).rows;
  } finally {
    await admin.query("ROLLBACK");
  }
  const manifest = assembleOwnedManifest(prepared, docker, identity, history, leaseId);
  validateOwnerTarget(ownerDatabaseUrl, manifest);
  assert.equal(env.ISSUE300_R2_CANDIDATE_SHA, manifest.candidateSha);
  assert.equal(prepared.migrationLedgerSha256,
    expectedLedgerDigest(manifest.migrationChecksums));
  // A failed attestation of a missing helper is NOT a license to modify it.
  // First check existence; only an ABSENT function may be installed.
  const catalog = await admin.query(`SELECT
    pg_catalog.to_regprocedure('public.issue300_r2_v2_migration_ledger_sha256()')
      IS NOT NULL AS present`);
  assert.equal(catalog.rowCount, 1);
  if (catalog.rows[0]?.present === false) {
    assert.equal(env.ISSUE300_R2_V2_LEDGER_HELPER_ENABLE, "INSTALL_EXACT_OWNED_V2",
      "V2_INSTALL_REQUIRES_SEPARATE_OWNER_APPROVAL");
    await install({ admin, ownerDatabaseUrl, manifest, env });
  } else {
    assert.equal(catalog.rows[0]?.present, true, "V2_HELPER_CATALOG_INDETERMINATE");
  }
  const functionHash = await attest(admin, runtime, prepared.migrationLedgerSha256);
  assert.match(functionHash, hex);
  const full = { ...manifest, migrationLedgerSha256: prepared.migrationLedgerSha256,
    ledgerHelperFunctionSha256: functionHash };
  const output = publish(full);
  return { ...output, candidateSha: full.candidateSha,
    ledgerSha256: full.migrationLedgerSha256 };
}

function currentSource() {
  return prepareSourceRecord(cleanHead(), r2ApiBundleHash(join(root, "apps/api/dist")),
    expectedLedgerFromSource());
}
export async function runCli(argv, env = process.env) {
  assert(argv.length === 1 && ["--prepare-source", "--issue"].includes(argv[0]),
    "Use exactly --prepare-source or --issue");
  if (argv[0] === "--prepare-source") {
    const output = immutableJson(preparedName, currentSource());
    return { mode: "SOURCE_ONLY", ...output };
  }
  // This check must precede ALL Docker, PostgreSQL and credential access.
  assertLease(env);
  const prepared = readPrepared();
  const fresh = currentSource();
  assertSourceFresh(prepared, fresh);
  const ownerUrl = validateConnection(env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL,
    fixed.migrationRole);
  const runtimeUrl = validateConnection(env.ISSUE300_R2_OWNED_RUNTIME_DATABASE_URL,
    fixed.runtimeRole);
  const docker = JSON.parse(execFileSync("docker", ["inspect", fixed.containerName],
    { encoding: "utf8", windowsHide: true }))[0];
  verifyOwnedDocker({ containerId: docker?.Id }, docker);
  const require = createRequire(join(root, "packages/database/package.json"));
  const { Client } = require("pg");
  const config = { connectionTimeoutMillis: 4000, statement_timeout: 3000 };
  const admin = new Client({ ...config, connectionString: ownerUrl });
  const runtime = new Client({ ...config, connectionString: runtimeUrl });
  try {
    await admin.connect();
    await runtime.connect();
    return await issueWithClients({ prepared, fresh, env, docker, admin, runtime,
      ownerDatabaseUrl: ownerUrl });
  } finally {
    await Promise.allSettled([admin.end(), runtime.end()]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then((result) => {
    console.log(JSON.stringify(result)); // No URL, credential, key or private data.
  }).catch((error) => {
    console.error(`V2_MANIFEST_REFUSED:${error?.code ?? "CHECK_FAILED"}`);
    process.exitCode = 1;
  });
}
