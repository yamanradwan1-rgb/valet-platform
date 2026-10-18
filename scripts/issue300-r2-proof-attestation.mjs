// Issue #300 R2: explicitly leased, read-only, disposable runtime attestation.
// This script never creates fixtures, grants privileges or turns the API gate on.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAttestedTarget,
  pgClient,
  validateSource,
} from "./issue300-closure-migration-proof.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const owned = join(root, "tmp/issue300-r2-owned");
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

function apiBundleHash() {
  const base = join(root, "apps/api/dist");
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (files.length > 12000 || entry.isSymbolicLink())
        throw Error("Unexpected compiled API artifact");
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  walk(base);
  assert(
    files.includes(join(base, "main.js")),
    "Compiled API entrypoint missing",
  );
  const hash = createHash("sha256");
  for (const file of files.sort((a, b) => a.localeCompare(b, "en"))) {
    hash
      .update(file.slice(base.length + 1).replaceAll("\\", "/"))
      .update("\0")
      .update(readFileSync(file))
      .update("\0");
  }
  return hash.digest("hex");
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
  const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert.equal(
    execFileSync("git", ["status", "--porcelain=v1"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    "",
    "Uncommitted source invalidates the proof candidate",
  );
  assert.equal(process.env.ISSUE300_R2_CANDIDATE_SHA, candidateSha);
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

  // W6's helper checks exact owner env file, Docker ID, task label, owned
  // volume, unique loopback port, migration-file bytes and role-derived URL.
  const target = getAttestedTarget();
  assert.equal(target.database, "issue300_r2");
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
    assert.equal(identity.name, "issue300_r2");
    assert.equal(identity.role, "issue300_r2_owner");
    assert.equal(identity.version, 170010);
    assert.equal(
      (
        await runtime.query(
          "SELECT current_user AS role, session_user AS login",
        )
      ).rows[0].role,
      target.runtimeRole,
    );
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
    for (const name of expectedNames) {
      const found = history.find((entry) => entry.migration_name === name);
      assert(
        found && found.checksum === sourceChecksum(name),
        `Complete migration history discrepancy at ${name}`,
      );
    }
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
    const role = (
      await admin.query(
        "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit FROM pg_roles WHERE rolname=$1",
        [target.runtimeRole],
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
    const now = Date.now();
    const apiBundleSha256 = apiBundleHash();
    const document = {
      project: "issue300",
      mode: "ISOLATED_PROOF_CANDIDATE",
      leaseId,
      candidateSha,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 15 * 60_000).toISOString(),
      database: "issue300_r2",
      host: "127.0.0.1",
      port: 57285,
      serverVersionNum: 170010,
      postgresStartedAt: identity.started.toISOString(),
      apiBundleSha256,
      containerName: "issue300_r2_pg17",
      containerId: target.containerId,
      containerLabel: "issue300-r2",
      volume: "issue300_r2_pgdata",
      runtimeRole: target.runtimeRole,
      actualRoleVerified: true,
      migrationsApplied: 96,
      birthTriggers: catalog.birth,
      immutableTriggers: catalog.immutable,
      migrationChecksums,
      allowedCohorts: ["SIGNED_HTTP_SOURCE_PARENT_CANDIDATE"],
      allowedScopes,
    };
    const bytes = Buffer.from(JSON.stringify(document));
    const path = join(owned, "R2_SIGNED_HTTP_LOCAL_ATTESTATION.json");
    writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
    console.log(
      `PASS task-owned attestation created; SHA256=${digest(bytes)}; valid 15 minutes; no API activation`,
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
