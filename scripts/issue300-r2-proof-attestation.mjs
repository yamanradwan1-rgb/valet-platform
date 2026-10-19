/* global process, console, Buffer, URL */
// R2 leased disposable attestation; never creates fixtures, grants or enables gates.
import assert from "node:assert/strict";
import { createHash, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pgClient, validateSource } from "./issue300-closure-migration-proof.mjs";
import { cleanCandidate } from "./issue300-r2-api-build-provenance.mjs";
import {
  assertManifestBuildBinding, currentBoundBuild,
} from "./issue300-r2-build-proof-binding.mjs";
import { readOwnedGuardFunctionHash } from "./issue300-r2-function-fingerprint.mjs";
import { requireOwnedScopeEvidence } from "./issue300-r2-scope-proof.mjs";
import { attestV2LedgerHelper } from "./issue300-r2-v2-ledger-issuer.mjs";
import { readV2Evidence } from "./issue300-r2-v2-versioned-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const owned = join(root, "tmp/issue300-r2-w7-acceptance-v2-owned");
// This is the ONLY candidate. Never substitute an operator-supplied host,
// inherited :57285 human service, wildcard port or production database.
const exact = Object.freeze({
  database: "issue300_r2_w7_acceptance_v2", host: "127.0.0.1", port: 58387,
  bindHost: "127.0.0.1", bindPort: 58387, serverVersionNum: 170010,
  apiOrigin: "http://127.0.0.1:3167",
  defaultApiOrigin: "http://127.0.0.1:3168",
  dashboardOrigin: "http://127.0.0.1:3117",
  containerName: "issue300_r2_w7_acceptance_v2_pg17", containerLabel: "issue300-r2-w7-acceptance-v2",
  volume: "issue300_r2_w7_acceptance_v2_pgdata", migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
});
const names = [
  "20260919004500_mgt_fix_02_pagination_snapshot_membership",
  "20261018009400_issue_300_u05_birth_xid",
  "20261018009500_issue_300_option_b_task_relation_provenance",
  "20261018009600_issue_300_option_b_attribution_freeze",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceChecksum = (name) =>
  digest(
    readFileSync(
      join(root, "packages/database/prisma/migrations", name, "migration.sql"),
    ),
  );

function ownedConnection(value, role) {
  let url;
  try { url = new URL(value ?? ""); }
  catch { throw Error("Unapproved isolated database URL"); }
  assert(url.protocol === "postgresql:" && url.hostname === exact.host &&
    url.port === String(exact.port) && url.pathname === `/${exact.database}` &&
    decodeURIComponent(url.username) === role && url.password.length > 0 &&
    url.search === "" && url.hash === "", "Unapproved isolated database URL");
  return url.href;
}

/** Static allowlist + Prime's task-owned ignored non-secret manifest + Docker
 * inspection all have to match before opening either database connection. */
function getOwnedAttestedTarget(candidateSha, leaseId, build) {
  const { bytes, name } = readV2Evidence(owned, "manifest",
    candidateSha, leaseId);
  const manifest = JSON.parse(bytes.toString("utf8"));
  for (const [key, value] of Object.entries(exact))
    assert.equal(manifest[key], value, `Unapproved resource ${key}`);
  assert.equal(manifest.candidateSha, candidateSha);
  assert.equal(manifest.leaseId, leaseId);
  assertManifestBuildBinding(manifest, build);
  assert.match(manifest.containerId ?? "", /^[a-f0-9]{64}$/);
  assert(Number.isFinite(Date.parse(manifest.postgresStartedAt)));
  assert(manifest.migrationChecksums &&
    Object.keys(manifest.migrationChecksums).length === 96);
  const docker = JSON.parse(execFileSync("docker", ["inspect", exact.containerName],
    { encoding: "utf8", windowsHide: true }))[0];
  const published = docker?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  const volume = docker?.Mounts?.filter((item) => item.Type === "volume" &&
    item.Name === exact.volume && item.Destination === "/var/lib/postgresql/data");
  assert(docker?.Id === manifest.containerId &&
    docker.Name === `/${exact.containerName}` && docker.State?.Running === true &&
    docker.Config?.Labels?.["com.vaylet.task"] === exact.containerLabel &&
    volume?.length === 1 && published.length === 1 &&
    published[0].HostIp === exact.bindHost &&
    published[0].HostPort === String(exact.bindPort) &&
    Object.keys(docker?.NetworkSettings?.Ports ?? {}).length === 1,
  "Docker container/label/volume/bind is not the exact owned resource");
  const migrationUrl = ownedConnection(
    process.env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL, exact.migrationRole);
  const runtimeUrl = ownedConnection(
    process.env.ISSUE300_R2_OWNED_RUNTIME_DATABASE_URL, exact.runtimeRole);
  return { manifest, manifestFilename: name,
    manifestSha256: digest(bytes), migrationUrl, runtimeUrl };
}

async function main() {
  validateSource();
  if (!process.argv.includes("--issue")) {
    console.log(
      "PASS R2 attestation source inventory; issuing requires exclusive lease --issue",
    );
    return;
  }
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.ISSUE300_R2_ATTESTATION_ISSUE_ENABLE, "1");
  const leaseId = process.env.ISSUE300_R2_PROOF_LEASE_ID;
  assert.match(leaseId ?? "", /^issue300-r2-[a-z0-9-]{8,}$/);
  const candidateSha = cleanCandidate(root);
  assert.equal(process.env.ISSUE300_R2_CANDIDATE_SHA, candidateSha);
  const build = currentBoundBuild(root, process.env);
  const scopePath = resolve(process.env.ISSUE300_R2_SCOPE_MANIFEST ?? "");
  assert.equal(
    dirname(scopePath),
    owned,
    "Scope manifest must be Prime-owned and local",
  );
  const allowedScopes = JSON.parse(readFileSync(scopePath, "utf8"));
  assert(
    Array.isArray(allowedScopes) &&
      allowedScopes.length > 0 &&
      allowedScopes.length <= 12,
  );
  for (const scope of allowedScopes) {
    assert.match(scope.organizationId, /^[a-f0-9-]{36}$/);
    assert.match(scope.locationId, /^[a-f0-9-]{36}$/);
    assert.equal(typeof scope.timeline, "boolean");
    assert(
      Array.isArray(scope.approvedAuditEventIds) &&
        scope.approvedAuditEventIds.length <= 200,
    );
    assert.equal(
      new Set(scope.approvedAuditEventIds).size,
      scope.approvedAuditEventIds.length,
    );
    for (const id of scope.approvedAuditEventIds)
      assert.match(
        id,
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
      );
    assert(
      Array.isArray(scope.searchWindows) && scope.searchWindows.length <= 12,
    );
    for (const window of scope.searchWindows) {
      assert(
        Number.isFinite(Date.parse(window.from)) &&
          Number.isFinite(Date.parse(window.to)) &&
          Date.parse(window.from) < Date.parse(window.to),
      );
    }
  }

  const target = getOwnedAttestedTarget(candidateSha, leaseId, build);
  const admin = pgClient(target.migrationUrl);
  const runtime = pgClient(target.runtimeUrl);
  await Promise.all([admin.connect(), runtime.connect()]);
  try {
    await admin.query("BEGIN READ ONLY");
    await runtime.query("BEGIN READ ONLY");
    const identity = (
      await admin.query(
        "SELECT current_database() AS name, current_user AS role, current_setting('server_version_num')::int AS version, pg_postmaster_start_time() AS started",
      )
    ).rows[0];
    assert.equal(identity.name, exact.database);
    assert.equal(identity.role, exact.migrationRole);
    assert.equal(identity.version, exact.serverVersionNum);
    assert.equal(identity.started.toISOString(), target.manifest.postgresStartedAt);
    const runtimeIdentity = (await runtime.query(
      "SELECT current_user AS role, session_user AS login")).rows[0];
    assert.equal(runtimeIdentity.role, exact.runtimeRole);
    assert.equal(runtimeIdentity.login, exact.runtimeRole);
    await requireOwnedScopeEvidence(admin, allowedScopes);
    const history = (
      await admin.query(
        "SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations",
      )
    ).rows;
    assert.equal(history.length, 96);
    assert(
      history.every((entry) => entry.finished_at && !entry.rolled_back_at),
    );
    const completeDirectory = join(root, "packages/database/prisma/migrations");
    const expectedNames = readdirSync(completeDirectory, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    assert.equal(expectedNames.length, 96);
    assert.equal(Object.keys(target.manifest.migrationChecksums).length, 96);
    for (const name of expectedNames) {
      const found = history.find((entry) => entry.migration_name === name);
      assert(
        found && found.checksum === sourceChecksum(name) &&
        target.manifest.migrationChecksums[name] === found.checksum,
        `Complete migration history discrepancy at ${name}`,
      );
    }
    const migrationLedgerSha256 = digest(Object.entries(target.manifest.migrationChecksums)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([name, sum]) => `${name}:${sum}`).join("\n"));
    const migrationChecksums = {};
    for (const name of names) {
      const value = history.find((entry) => entry.migration_name === name);
      assert(
        value && value.checksum === sourceChecksum(name),
        `Migration checksum missing/mismatched: ${name}`,
      );
      migrationChecksums[name] = value.checksum;
    }
    const catalog = (
      await admin.query(
        `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE tgname LIKE '%pagination_birth%')::int AS birth,
       count(*) FILTER (WHERE tgname LIKE '%issue300%immutable')::int AS immutable
       FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A')`,
      )
    ).rows[0];
    assert.equal(catalog.birth, 12);
    assert.equal(catalog.immutable, 6);
    const guardFunctionsSha256 = await readOwnedGuardFunctionHash(admin);
    const role = (
      await admin.query(
        "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit FROM pg_roles WHERE rolname=$1",
        [exact.runtimeRole],
      )
    ).rows[0];
    assert(role && Object.values(role).every((value) => value === false));
    const denied = (
      await runtime.query(
        "SELECT has_table_privilege(current_user,'public.audit_events','UPDATE') AS audit_update, has_table_privilege(current_user,'public._prisma_migrations','SELECT') AS ledger_read",
      )
    ).rows[0];
    assert.equal(denied.audit_update, false);
    assert.equal(denied.ledger_read, false);
    const ledgerHelperFunctionSha256 = await attestV2LedgerHelper(
      admin, runtime, migrationLedgerSha256);
    const now = Date.now();
    const document = {
      project: "issue300",
      mode: "ISOLATED_PROOF_CANDIDATE",
      leaseId,
      candidateSha,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 15 * 60_000).toISOString(),
      ...exact,
      postgresStartedAt: identity.started.toISOString(),
      apiBundleSha256: build.apiBundleSha256,
      contractsBundleSha256: build.contractsBundleSha256,
      sourceSha256: build.sourceSha256,
      apiBuildReceiptSha256: build.apiBuildReceiptSha256,
      artifactVersion: 1,
      resourceManifestFilename: target.manifestFilename,
      resourceManifestSha256: target.manifestSha256,
      migrationLedgerSha256,
      ledgerHelperFunctionSha256,
      containerId: target.manifest.containerId,
      actualRoleVerified: true,
      migrationsApplied: 96,
      birthTriggers: catalog.birth,
      immutableTriggers: catalog.immutable,
      guardFunctionsSha256,
      migrationChecksums,
      allowedCohorts: ["SIGNED_HTTP_SOURCE_PARENT_CANDIDATE"],
      allowedScopes,
    };
    const bytes = Buffer.from(JSON.stringify(document));
    assert.deepEqual(currentBoundBuild(root, process.env), build,
      "BUILD_CHANGED_BEFORE_OWNER_SIGNATURE");
    assertManifestBuildBinding(target.manifest, build);
    // Each short-lived certificate is immutable. An expired or interrupted
    // previous issue must never be overwritten or silently reused.
    const path = join(owned,
      `R2_SIGNED_HTTP_LOCAL_ATTESTATION_${candidateSha.slice(0, 12)}_${now}_${leaseId}.json`);
    // Prime owns the ignored key; never print, commit or select it via env.
    const signature = sign(null, bytes,
      readFileSync(join(root, "tmp/issue300-r2-v2-prime-owned/issuer-private.pem")));
    assert.equal(signature.length, 64, "Owner attestation signing failed");
    // Sidecar first, certificate last as the commit marker. Any interruption
    // leaves one missing side and the runtime verifier fails closed.
    writeFileSync(`${path}.sig`, signature.toString("base64"),
      { flag: "wx", mode: 0o600 });
    writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
    console.log(
      `PASS task-owned attestation created; path=${path}; SHA256=${digest(bytes)}; valid 15 minutes; no API activation`,
    );
  } finally {
    await Promise.allSettled([
      admin.query("ROLLBACK"),
      runtime.query("ROLLBACK"),
    ]);
    await Promise.allSettled([admin.end(), runtime.end()]);
  }
}

await main();
