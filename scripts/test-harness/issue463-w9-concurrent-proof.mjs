// Dedicated owner-attested PostgreSQL17 W2 concurrency proof. Never routes to
// a shared or production DB. Every resource is new and destroyed in finally.
import { createHash } from "node:crypto";
import console from "node:console";
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import {
  bootstrapExactCiRoles,
} from "./issue463-w9-proof-bootstrap.mjs";
import {
  checkLocalDocker, containerDetails, createIdentity,
  destroyOwned, launchOwned, ownedPsql,
} from "./issue463-w9-proof-docker.mjs";
import {
  checked, execute,
} from "./issue463-w9-proof-process.mjs";
import {
  attestBeforeAndAfter, migrationInventory,
} from "./issue463-w9-proof-verify.mjs";
import {
  repeatConcurrentOwnerGrants,
} from "./issue463-w9-proof-grant-race.mjs";
import {
  ISSUE463_P2_REVIEWED_SQL_SHA256,
} from "./issue463-shared-role-policy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(here, "../..");
const sourceRoot = harnessRoot;
const expectedCommit = process.env.ISSUE463_W9_EXPECTED_CANDIDATE;
const cli = join(harnessRoot, "packages/database/node_modules/prisma/build/index.js");
const config = join(
  harnessRoot, "packages/database/issue463-w9-concurrent-proof.prisma.config.ts");
const p2 = join(sourceRoot,
  "packages/database/prisma/migrations",
  "20261127000100_issue463_guest_rating_comments_p2", "migration.sql");

function scrub(text, identity) {
  let output = String(text);
  for (const secret of [
    identity.bootstrapSecret, identity.migratorSecret, identity.managementSecret,
  ]) output = output.replaceAll(secret, "[REDACTED]");
  return output;
}

function assertSource(source) {
  if (!existsSync(sourceRoot) || !existsSync(cli) || !existsSync(config))
    throw new Error("Isolated source/Prisma CLI/config is missing.");
  const normalized = readFileSync(p2, "utf8").replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(normalized).digest("hex");
  if (digest !== ISSUE463_P2_REVIEWED_SQL_SHA256)
    throw new Error("Issue463 P2 SQL differs from the exact W2 review pin.");
  return source;
}

async function sourceIdentity() {
  const rev = (await checked([
    "git", "-C", sourceRoot, "rev-parse", "HEAD",
  ])).stdout.trim();
  const changed = (await checked([
    "git", "-C", sourceRoot, "status", "--porcelain",
  ])).stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? "") || rev !== expectedCommit || changed !== "")
    throw new Error("W2 source worktree is not the expected clean commit.");
  return assertSource(rev);
}

async function checkBootstrap(identity) {
  const result = await ownedPsql(identity,
    "SELECT current_setting('server_version_num') || '|' || " +
    "system_identifier::text FROM pg_catalog.pg_control_system();");
  const pair = result.stdout.match(/\b(17\d{4})\|([0-9]{8,})\b/);
  if (!pair) throw new Error("Disposable cluster PG17/system identity unverified.");
  identity.systemId = pair[2];
  const details = await containerDetails(identity.containerId);
  if (details.State?.Health?.Status !== "healthy")
    throw new Error("Docker PG17 health is not attested.");
}

function migrateEnv(identity, database) {
  const url = new URL(`postgresql://valet@127.0.0.1:${identity.port}/${database}`);
  url.password = identity.migratorSecret;
  // Avoid passing unrelated user, production or connected database secrets.
  return {
    Path: process.env.Path ?? process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
    TEMP: process.env.TEMP ?? "",
    TMP: process.env.TMP ?? "",
    NODE_ENV: "test",
    ISSUE463_W9_PROOF_ROOT: sourceRoot,
    MIGRATION_DATABASE_URL: url.toString(),
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    NO_COLOR: "1",
    VAYLET_TEST_POSTGRES_CONNECTION_LIMIT: "8",
  };
}

async function applyOfficialMigrations(identity, database) {
  const started = Date.now();
  const result = await execute([
    process.execPath, cli, "migrate", "deploy", "--config", config,
  ], {
    cwd: join(harnessRoot, "packages/database"),
    env: migrateEnv(identity, database),
    timeoutMs: 420_000,
    maxBytes: 768 * 1024,
  });
  return {
    database, exitCode: result.code,
    elapsedMs: Date.now() - started,
    timedOut: result.timedOut, truncated: result.truncated,
    stdoutTail: scrub(result.stdout.slice(-4500), identity),
    stderrTail: scrub(result.stderr.slice(-4500), identity),
  };
}

async function main() {
  if (process.env.ISSUE463_W9_DISPOSABLE !== "I_OWN_DISPOSABLE_W9")
    throw new Error("This task requires exact owner approval for disposable W9.");
  const identity = createIdentity();
  const evidence = {
    owner: identity.owner, containerName: identity.containerName,
    imageId: "sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085",
    gitCommit: expectedCommit, phase: "NOT_STARTED",
    startedAt: new Date().toISOString(),
  };
  let problem = null;
  try {
    await checkLocalDocker();
    await sourceIdentity();
    evidence.expectedMigrations = migrationInventory(sourceRoot).size;
    await launchOwned(identity);
    evidence.containerId = identity.containerId;
    evidence.port = identity.port;
    await checkBootstrap(identity);
    evidence.systemId = identity.systemId;
    await bootstrapExactCiRoles(identity);
    evidence.before = await Promise.all(identity.databaseNames.map((db) =>
      attestBeforeAndAfter(identity, db, sourceRoot, false)));
    evidence.phase = "CONCURRENT_OFFICIAL_MIGRATION";
    evidence.migrations = await Promise.all(identity.databaseNames.map((db) =>
      applyOfficialMigrations(identity, db)));
    evidence.migrationExitCodes = evidence.migrations.map((x) => x.exitCode);
    if (evidence.migrations.some((x) =>
      x.exitCode !== 0 || x.timedOut || x.truncated))
      throw new Error("Concurrent official Prisma migrate deploy reported a failure.");
    evidence.after = await Promise.all(identity.databaseNames.map((db) =>
      attestBeforeAndAfter(identity, db, sourceRoot, true)));
    if (evidence.after.some((x) => x.systemId !== identity.systemId))
      throw new Error("Concurrent migration DBs did not share the attested cluster.");
    evidence.concurrentGrant = await repeatConcurrentOwnerGrants(identity);
    evidence.afterConcurrentGrant = await Promise.all(
      identity.databaseNames.map((db) =>
        attestBeforeAndAfter(identity, db, sourceRoot, true)));
    if (evidence.afterConcurrentGrant.some((result) =>
      result.migrationCount !== evidence.expectedMigrations ||
      result.systemId !== identity.systemId))
      throw new Error("Concurrent repeated GRANT invalidated migration evidence.");
    evidence.phase = "PASS";
  } catch (error) {
    problem = scrub(error instanceof Error ? error.message : error, identity);
    evidence.phase = "FAIL";
    evidence.failure = problem;
  } finally {
    try {
      await destroyOwned(identity);
      evidence.exactOwnedCleanup = "VERIFIED";
    } catch (error) {
      evidence.exactOwnedCleanup = "UNVERIFIED";
      evidence.cleanupFailure = scrub(error instanceof Error ? error.message : error, identity);
      problem ??= evidence.cleanupFailure;
    }
    evidence.finishedAt = new Date().toISOString();
    const outputDir = resolve(harnessRoot, "../../issue463-w9-concurrent-evidence");
    mkdirSync(outputDir, { recursive: true });
    const evidenceFile = join(outputDir,
      `w9-${identity.prefix}-concurrent.json`);
    writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify({
      result: evidence.phase,
      cleanup: evidence.exactOwnedCleanup,
      run: identity.prefix,
      migrationCodes: evidence.migrationExitCodes,
      afterCounts: evidence.after?.map((x) => x.migrationCount),
      failure: problem,
      evidenceFile,
    }));
  }
  if (problem || evidence.phase !== "PASS" ||
      evidence.exactOwnedCleanup !== "VERIFIED")
    process.exitCode = 1;
}

await main();
