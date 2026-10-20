// Issue300 W7: Prime-only, test-only browser target issuance.
// Separate from U005/API certificates. NEVER run this in W7's browser runner.
// Modes: --self-test (pure, no private files/HTTP/DB) or --issue (Prime only).
/* global Buffer, process, console */
import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { selectSignedPreflight } from "./issue300-r2-browser-preflight-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ownerDir = join(root, "tmp", "issue300-r2-v2-prime-owned");
const privateKeyPath = join(ownerDir, "issuer-private.pem");
const pinnedSpki = "MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=";
const publicKey = createPublicKey({
  key: Buffer.from(pinnedSpki, "base64"),
  format: "der",
  type: "spki",
});
const sha40 = /^[a-f0-9]{40}$/;
const sha64 = /^[a-f0-9]{64}$/;
const leasePattern = /^issue300-r2-w7-[a-z0-9-]{8,}$/;
const V2 = Object.freeze({
  dashboardOrigin: "http://127.0.0.1:3117",
  apiOrigin: "http://127.0.0.1:3167",
  host: "127.0.0.1",
  port: 58387,
  database: "issue300_r2_w7_acceptance_v2",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
  label: "issue300-r2-w7-acceptance-v2",
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const requireExact = (actual, expected, label) => {
  assert.equal(actual, expected, `GAP: wrong V2 ${label}`);
};
const exactKeys = (value, fields) => {
  assert(value && typeof value === "object" && !Array.isArray(value), "GAP: invalid owner preflight object");
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), "GAP: unexpected or missing preflight fields");
};

// All signed live facts are prepared by INDEPENDENT Prime runtime verification.
// This function NEVER derives authority from environment-controlled port/URL.
function validateLivePreflight(proof, { candidateSha, leaseId, now }) {
  exactKeys(proof, [
    "kind",
    "candidateSha",
    "leaseId",
    "issuedAt",
    "expiresAt",
    "dashboardOrigin",
    "apiOrigin",
    "apiRewriteOrigin",
    "dashboard",
    "api",
    "postgres",
    "testOnly",
    "exclusiveLeaseVerified",
  ]);
  requireExact(proof.kind, "ISSUE300_W7_V2_INDEPENDENT_LIVE_PREFLIGHT_V1", "kind");
  assert(sha40.test(candidateSha), "GAP: invalid candidate SHA");
  assert(leasePattern.test(leaseId), "GAP: invalid W7 lease");
  requireExact(proof.candidateSha, candidateSha, "candidate SHA");
  requireExact(proof.leaseId, leaseId, "lease ID");
  requireExact(proof.dashboardOrigin, V2.dashboardOrigin, "Dashboard origin");
  requireExact(proof.apiOrigin, V2.apiOrigin, "API origin");
  requireExact(proof.apiRewriteOrigin, V2.apiOrigin, "Dashboard API rewrite");
  requireExact(proof.testOnly, true, "test-only mode");
  requireExact(proof.exclusiveLeaseVerified, true, "exclusive lease");
  const issued = Date.parse(proof.issuedAt);
  const expires = Date.parse(proof.expiresAt);
  assert(
    Number.isFinite(issued) && issued <= now && now - issued < 60_000 &&
      Number.isFinite(expires) && expires > now && expires - issued === 60_000,
    "GAP: missing, stale or overlong independently signed preflight",
  );
  exactKeys(proof.dashboard, ["loopbackOnly", "listenerVerified", "processOwned", "candidateSha", "bundleSha256"]);
  exactKeys(proof.api, ["loopbackOnly", "listenerVerified", "processOwned", "candidateSha", "bundleSha256", "ordinaryRoleVerified", "guardedProofIsolated"]);
  for (const [name, service] of [
    ["Dashboard", proof.dashboard],
    ["API", proof.api],
  ]) {
    requireExact(service.loopbackOnly, true, `${name} loopback bind`);
    requireExact(service.listenerVerified, true, `${name} live listener`);
    requireExact(service.processOwned, true, `${name} process ownership`);
    requireExact(service.candidateSha, candidateSha, `${name} build SHA`);
    assert(sha64.test(service.bundleSha256), `GAP: ${name} bundle digest missing`);
  }
  requireExact(proof.api.ordinaryRoleVerified, true, "API actual runtime role");
  requireExact(proof.api.guardedProofIsolated, true, "API proof isolation");
  exactKeys(proof.postgres, [
    "host",
    "port",
    "database",
    "migrationRole",
    "runtimeRole",
    "containerName",
    "containerId",
    "volume",
    "label",
    "serverVersionNum",
    "migrationsApplied",
    "migrationChecksumsVerified",
    "birthTriggers",
    "immutableTriggers",
    "actualRolesVerified",
    "loopbackOnly",
    "containerRunning",
    "volumeOwned",
    "labelVerified",
  ]);
  for (const key of ["host", "port", "database", "migrationRole", "runtimeRole", "containerName", "volume", "label"])
    requireExact(proof.postgres[key], V2[key], `Postgres ${key}`);
  assert(sha64.test(proof.postgres.containerId), "GAP: exact Docker ID missing");
  for (const [key, expected] of [
    ["serverVersionNum", 170010],
    ["migrationsApplied", 96],
    ["birthTriggers", 12],
    ["immutableTriggers", 6],
    ["migrationChecksumsVerified", true],
    ["actualRolesVerified", true],
    ["loopbackOnly", true],
    ["containerRunning", true],
    ["volumeOwned", true],
    ["labelVerified", true],
  ])
    requireExact(proof.postgres[key], expected, `Postgres ${key}`);
  return expires;
}

function verifyPreflight(bytes, signature, options, key = publicKey) {
  assert(bytes.length > 0 && bytes.length <= 8192, "GAP: preflight bytes outside the proof bound");
  assert(signature.length === 64 && verify(null, bytes, key, signature), "GAP: independently issued Prime preflight signature missing/invalid");
  const proof = JSON.parse(bytes.toString("utf8"));
  const expires = validateLivePreflight(proof, options);
  return { proof, expires };
}

function browserManifest({ proof, expires }, now) {
  return Buffer.from(
    JSON.stringify({
      kind: "ISSUE300_W7_ISOLATED_BROWSER_TARGET_V1",
      candidateSha: proof.candidateSha,
      leaseId: proof.leaseId,
      dashboardOrigin: V2.dashboardOrigin,
      apiOrigin: V2.apiOrigin,
      allowedOrigins: [V2.dashboardOrigin],
      expiresAt: new Date(Math.min(expires, now + 15 * 60_000)).toISOString(),
    }),
  );
}

function safeFile(path, maxSize) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maxSize, "GAP: preflight/signer file not an owned regular file");
  return readFileSync(path);
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

function issue() {
  assert.equal(process.env.NODE_ENV, "test", "GAP: test mode required");
  assert.equal(process.env.ISSUE300_W7_OWNER_BROWSER_ISSUE_ENABLE, "1", "GAP: explicit Prime issuer approval required");
  assert.equal(process.env.ISSUE300_W7_TEST_ONLY_BROWSER_PROOF, "1");
  assert.equal(git(["status", "--porcelain=v1"]), "", "GAP: final integrated candidate must be clean");
  const candidateSha = git(["rev-parse", "HEAD"]);
  requireExact(process.env.ISSUE300_R2_CANDIDATE_SHA, candidateSha, "approved immutable checkout");
  const leaseId = process.env.ISSUE300_W7_EXCLUSIVE_LEASE;
  const now = Date.now();
  // Only the newest Owner-signed live preflight is eligible, never an env path.
  const selected = selectSignedPreflight(ownerDir, candidateSha, leaseId,
    now, publicKey);
  const live = verifyPreflight(selected.bytes, selected.signature,
    { candidateSha, leaseId, now });
  const bytes = browserManifest(live, now);
  // Only after all validations may this Prime-only command read the issuer key.
  const privateKey = createPrivateKey(safeFile(privateKeyPath, 8192));
  assert(privateKey.asymmetricKeyType === "ed25519");
  assert(
    createPublicKey(privateKey).export({ format: "der", type: "spki" }).equals(Buffer.from(pinnedSpki, "base64")),
    "GAP: private issuer is not Owner's pinned signing identity",
  );
  const signature = sign(null, bytes, privateKey);
  assert(signature.length === 64 && verify(null, bytes, publicKey, signature));
  const confirmed = selectSignedPreflight(ownerDir, candidateSha, leaseId,
    Date.now(), publicKey);
  assert(confirmed.path === selected.path &&
    confirmed.bytes.equals(selected.bytes) &&
    confirmed.signature.equals(selected.signature),
  "GAP: signed browser preflight changed during issuance");
  // Derive only from verified SHA and clock under FIXED ignored owner directory;
  // fresh grants support sequential one-use browser tests without overwrites.
  const outputPath = join(ownerDir, `W7_BROWSER_TARGET_${candidateSha.slice(0, 12)}_${now}.json`);
  writeFileSync(outputPath, bytes, { flag: "wx", mode: 0o600 });
  writeFileSync(outputPath + ".sig", signature, { flag: "wx", mode: 0o600 });
  console.log(
    `PASS Owner-issued V2 browser target path=${outputPath}; SHA256=${hash(bytes)}; expiresAt=${JSON.parse(bytes.toString()).expiresAt}; no secret printed`,
  );
}

function selfTest() {
  const { privateKey, publicKey: temporaryPublic } = generateKeyPairSync("ed25519");
  const now = Date.parse("2026-10-18T20:00:00.000Z");
  const candidateSha = "a".repeat(40);
  const leaseId = "issue300-r2-w7-browser-lease-20261018";
  const build = "b".repeat(64);
  const proof = {
    kind: "ISSUE300_W7_V2_INDEPENDENT_LIVE_PREFLIGHT_V1",
    candidateSha,
    leaseId,
    issuedAt: new Date(now - 2000).toISOString(),
    expiresAt: new Date(now + 58_000).toISOString(),
    dashboardOrigin: V2.dashboardOrigin,
    apiOrigin: V2.apiOrigin,
    apiRewriteOrigin: V2.apiOrigin,
    dashboard: { loopbackOnly: true, listenerVerified: true, processOwned: true, candidateSha, bundleSha256: build },
    api: {
      loopbackOnly: true,
      listenerVerified: true,
      processOwned: true,
      candidateSha,
      bundleSha256: build,
      ordinaryRoleVerified: true,
      guardedProofIsolated: true,
    },
    postgres: {
      ...Object.fromEntries(["host", "port", "database", "migrationRole", "runtimeRole", "containerName", "volume", "label"].map((k) => [k, V2[k]])),
      containerId: "c".repeat(64),
      serverVersionNum: 170010,
      migrationsApplied: 96,
      migrationChecksumsVerified: true,
      birthTriggers: 12,
      immutableTriggers: 6,
      actualRolesVerified: true,
      loopbackOnly: true,
      containerRunning: true,
      volumeOwned: true,
      labelVerified: true,
    },
    testOnly: true,
    exclusiveLeaseVerified: true,
  };
  const args = { candidateSha, leaseId, now };
  const signed = (value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    return [bytes, sign(null, bytes, privateKey)];
  };
  const [bytes, signature] = signed(proof);
  const approved = verifyPreflight(bytes, signature, args, temporaryPublic);
  const manifest = JSON.parse(browserManifest(approved, now));
  assert.deepEqual(manifest.allowedOrigins, [V2.dashboardOrigin]);
  assert.equal(manifest.apiOrigin, V2.apiOrigin);
  const deny = (value) => {
    const [data, sig] = signed(value);
    assert.throws(() => verifyPreflight(data, sig, args, temporaryPublic));
  };
  for (const [key, bad] of [
    ["dashboardOrigin", "http://127.0.0.1:3114"],
    ["apiOrigin", "http://127.0.0.1:3165"],
    ["apiRewriteOrigin", "http://127.0.0.1:3165"],
    ["candidateSha", "d".repeat(40)],
    ["leaseId", "wrong-lease"],
    ["exclusiveLeaseVerified", false],
    ["testOnly", false],
    ["issuedAt", new Date(now - 100_000).toISOString()],
  ])
    deny({ ...proof, [key]: bad });
  deny({ ...proof, api: { ...proof.api, listenerVerified: false } });
  deny({ ...proof, dashboard: { ...proof.dashboard, bundleSha256: "invalid" } });
  for (const [key, bad] of [
    ["port", 57285],
    ["database", "issue300_r2"],
    ["containerName", "issue300_r2_pg17"],
    ["label", "issue300-r2"],
    ["volume", "issue300_r2_pgdata"],
    ["runtimeRole", "issue300_r2_w6_runtime"],
    ["migrationRole", "issue300_r2_owner"],
    ["migrationsApplied", 95],
    ["actualRolesVerified", false],
    ["migrationChecksumsVerified", false],
  ])
    deny({ ...proof, postgres: { ...proof.postgres, [key]: bad } });
  const forged = Buffer.from(JSON.stringify({ ...proof, dashboardOrigin: "http://127.0.0.1:3999" }));
  assert.throws(() => verifyPreflight(forged, signature, args, temporaryPublic));
  assert.throws(() => verifyPreflight(bytes, Buffer.alloc(64), args, temporaryPublic));
  assert.throws(() => verifyPreflight(bytes, signature, { ...args, candidateSha: "f".repeat(40) }, temporaryPublic));
  assert.throws(() => verifyPreflight(bytes, signature, { ...args, now: now + 16 * 60_000 }, temporaryPublic));
  console.log("PASS W7 browser issuer source-only negative tests (no private key/DB/HTTP)");
}

if (process.argv.length !== 3 || !["--self-test", "--issue"].includes(process.argv[2]))
  throw new Error("Usage: node scripts/issue300-r2-browser-target-issuer.mjs --self-test|--issue");
if (process.argv[2] === "--self-test") selfTest();
else issue();
