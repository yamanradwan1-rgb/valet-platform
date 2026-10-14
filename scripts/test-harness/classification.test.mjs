import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertExecutableDatabaseAccessAllowed,
  classifyPackageTests,
  discoverTests,
} from "./test-classification.mjs";
import {
  preflightIssue215BeforeHarnessCleanup,
  requiresIssue215Preflight,
  requiresIssue215StaleOwnerPreflight,
} from "./issue215-target-preflight.mjs";
import {
  ISSUE215_PROJECT,
  issue215PostgresFiles,
} from "./issue215-test-manifest.mjs";
import { cleanupOwnedRun, hasIssue215OwnedResources } from "./owned-cleanup.mjs";
import {
  acquireClusterLease,
  appendOwnershipEvent,
  clusterKey,
} from "./ownership-state.mjs";
import { parkClusterLeaseForRecovery } from "./park-cluster-lease.mjs";

test("Issue 215 target preflight depends only on authoritative test-project ownership", () => {
  assert.equal(requiresIssue215Preflight([ISSUE215_PROJECT]), true);
  assert.equal(requiresIssue215Preflight(["database-postgres-direct"]), false);
  assert.equal(requiresIssue215Preflight(["database-postgres-provision"]), false);
  assert.equal(requiresIssue215Preflight(["api-postgres-standard"]), false);
  assert.equal(requiresIssue215Preflight(["database-non-postgres"]), false);
  assert.equal(requiresIssue215Preflight([]), false);
  assert.equal(
    requiresIssue215Preflight(["database-postgres-direct", ISSUE215_PROJECT, "database-postgres-provision"]),
    true,
  );
  // No argv-based inference: Vitest can interpret file-like values as
  // exclusions, output paths, changed filters or reporter configuration.
  for (const option of ["--exclude", "--changed", "--outputFile", "--reporter", "--related"]) {
    assert.equal(requiresIssue215Preflight([ISSUE215_PROJECT], ["node", option, "src/foreign.test.ts"]), true);
    assert.equal(requiresIssue215Preflight(["database-postgres-direct"], ["node", option, "src/condition-photo-p1-integrity.integration.test.ts"]), false);
  }
});

test("stale owner attestation fences old mixed P1 runs without pinning unrelated new leases", () => {
  for (const projectName of [
    "root-tests", "database-package-tests", "focused-database",
    "database-postgres-direct", "database-postgres-provision",
    "postgres-projects-database-postgres-direct-database-postgres-provision",
  ]) {
    assert.equal(requiresIssue215StaleOwnerPreflight({ projectName }), true);
    assert.equal(requiresIssue215StaleOwnerPreflight({ projectName, issue215Protected: false }), false);
  }
  assert.equal(requiresIssue215StaleOwnerPreflight({ projectName: "api-postgres-standard" }), false);
  assert.equal(requiresIssue215StaleOwnerPreflight({ issue215Protected: true, projectName: "ordinary" }), true);
  assert.equal(requiresIssue215StaleOwnerPreflight(undefined), false);
});

test("failed preflight parks recovery ancestry instead of deleting old owned resource metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-issue215-recovery-chain-"));
  const databaseUrl = "postgresql://fake:fake@127.0.0.1:5432/valet";
  const path = join(root, clusterKey(databaseUrl), "owner.json");
  const retire = (runId) => {
    parkClusterLeaseForRecovery({ databaseUrl, runId, stateRoot: root });
    const previous = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({
      ...previous, pid: 99999999, startedAt: "2000-01-01T00:00:00Z",
    }));
  };
  try {
    acquireClusterLease({ databaseUrl, projectName: "database-postgres-provision",
      runId: "legacy-old", stateRoot: root });
    retire("legacy-old");
    const legacy = JSON.parse(readFileSync(path, "utf8"));
    delete legacy.issue215Protected;
    delete legacy.issue215RecoveryRequired;
    writeFileSync(path, JSON.stringify(legacy));
    const second = acquireClusterLease({ databaseUrl, projectName: "ordinary-new",
      runId: "ordinary-new", stateRoot: root });
    assert.equal(requiresIssue215StaleOwnerPreflight(second.staleOwner), true);
    retire("ordinary-new");
    const third = acquireClusterLease({ databaseUrl, projectName: "ordinary-next",
      runId: "ordinary-next", stateRoot: root });
    assert.equal(third.staleOwner.issue215RecoveryRequired, true);
    assert.deepEqual(third.staleOwner.recoveryRunIds, ["legacy-old"]);
    assert.equal(requiresIssue215StaleOwnerPreflight(third.staleOwner), true);
    parkClusterLeaseForRecovery({ databaseUrl, runId: "ordinary-next", stateRoot: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Issue 215 P1 rejects missing target despite a migration URL before acquiring a cluster lease", async () => {
  const before = process.env.TEST_DATABASE_URL;
  const migration = process.env.MIGRATION_DATABASE_URL;
  try {
    delete process.env.TEST_DATABASE_URL;
    process.env.MIGRATION_DATABASE_URL = "postgresql://fake:fake@db.example.invalid:5432/valet";
    await assert.rejects(
      preflightIssue215BeforeHarnessCleanup([ISSUE215_PROJECT]),
      /Issue 215 test target/,
    );
  } finally {
    if (before === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = before;
    if (migration === undefined) delete process.env.MIGRATION_DATABASE_URL;
    else process.env.MIGRATION_DATABASE_URL = migration;
  }
});

test("an unrelated stale-owner cleanup refuses known Issue215 resources before any SQL/child cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-issue215-recovery-"));
  const databaseUrl = "postgresql://fake:fake@127.0.0.1:5432/valet";
  const runId = "test-unrelated-stale-recovery";
  const resource = "vlt_t_db_215_" + "a".repeat(32);
  const observed = [];
  const oldUrl = process.env.TEST_DATABASE_URL;
  try {
    appendOwnershipEvent({
      databaseUrl, runId, stateRoot: root,
      event: { type: "resource-planned", kind: "database", name: resource, absentBeforeCreate: true },
    });
    assert.equal(hasIssue215OwnedResources([{ type: "resource-planned", kind: "database", name: resource }]), true);
    delete process.env.TEST_DATABASE_URL;
    await assert.rejects(cleanupOwnedRun({
      databaseUrl, runId, stateRoot: root,
      adapter: {
        killProcess: async () => observed.push("kill"),
        dropDatabase: async () => observed.push("drop"),
        dropRole: async () => observed.push("role"),
      },
    }), /Issue 215 test target/);
    assert.deepEqual(observed, []);
  } finally {
    if (oldUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = oldUrl;
    rmSync(root, { recursive: true, force: true });
  }
});

test("a protected run marker fences stale recovery even before its first CREATE", async () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-issue215-marked-"));
  const databaseUrl = "postgresql://fake:fake@127.0.0.1:5432/valet";
  const runId = "test-protected-run-without-resource";
  const observed = [];
  const oldUrl = process.env.TEST_DATABASE_URL;
  try {
    appendOwnershipEvent({
      databaseUrl, runId, stateRoot: root,
      event: { type: "issue215-protected-run" },
    });
    delete process.env.TEST_DATABASE_URL;
    await assert.rejects(cleanupOwnedRun({
      databaseUrl, runId, stateRoot: root,
      adapter: {
        killProcess: async () => observed.push("kill"),
        dropDatabase: async () => observed.push("drop-db"),
        dropRole: async () => observed.push("drop-role"),
      },
    }), /Issue 215 test target/);
    assert.deepEqual(observed, []);
  } finally {
    if (oldUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = oldUrl;
    rmSync(root, { recursive: true, force: true });
  }
});

test("a PostgreSQL test importing an Issue215 mutation fixture must join the protected manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-issue215-dependency-"));
  try {
    writeFileSync(join(root, "ordinary-name.integration.test.ts"),
      'import "./condition-photo-p1-owned-target.js";\n');
    writeFileSync(join(root, "condition-photo-p1-owned-target.ts"),
      'import { Client } from "pg";\nconst connection = new Client();\n');
    assert.throws(
      () => classifyPackageTests({ packageKind: "database", rootDir: root }),
      /Unregistered Issue 215 PostgreSQL fixture usage/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("current API and database tests each have exactly one owner", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const apiRoot = join(repoRoot, "apps", "api", "test");
  const databaseRoot = join(repoRoot, "packages", "database", "src");
  const api = classifyPackageTests({ packageKind: "api", rootDir: apiRoot });
  const database = classifyPackageTests({
    packageKind: "database",
    rootDir: databaseRoot,
  });

  assert.equal(Object.values(api).flat().length, discoverTests(apiRoot).length);
  assert.equal(
    Object.values(database).flat().length,
    discoverTests(databaseRoot).length,
  );
  assert.equal(database["database-non-postgres"].length, 7);
  assert.equal(database["database-postgres-direct"].length, 41);
  assert.equal(database["database-postgres-provision"].length, 41);
  assert.deepEqual(database[ISSUE215_PROJECT], issue215PostgresFiles);
  assert.ok(api["api-non-postgres"].includes("postgres.test.ts"));
  assert.ok(
    api["api-non-postgres"].includes("shift-test-context-names.test.ts"),
  );
  assert.ok(
    Object.entries(api)
      .filter(([name]) => name.includes("postgres"))
      .flatMap(([, files]) => files)
      .includes("provision-staff.integration.test.ts"),
  );
});

test("transitive DB fixture access is classified into a PostgreSQL project", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-classify-"));
  try {
    writeFileSync(
      join(root, "db-fixture.ts"),
      'import { Pool } from "pg";\nexport const pool = new Pool();\n',
    );
    writeFileSync(
      join(root, "indirect.test.ts"),
      'import { pool } from "./db-fixture";\nvoid pool;\n',
    );
    writeFileSync(join(root, "pure.test.ts"), "export const value = 1;\n");
    const result = classifyPackageTests({ packageKind: "api", rootDir: root });
    assert.deepEqual(result["api-postgres-standard"], ["indirect.test.ts"]);
    assert.deepEqual(result["api-non-postgres"], ["pure.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NodeNext source extensions keep transitive DB ownership", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-nodenext-classify-"));
  try {
    writeFileSync(
      join(root, "db-fixture.mts"),
      'import { Client } from "pg";\nexport const client = new Client();\n',
    );
    writeFileSync(
      join(root, "indirect.test.mts"),
      'import { client } from "./db-fixture.mjs";\nvoid client;\n',
    );
    const result = classifyPackageTests({ packageKind: "api", rootDir: root });
    assert.deepEqual(result["api-postgres-standard"], ["indirect.test.mts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CommonJS require keeps transitive DB ownership", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-cjs-classify-"));
  try {
    writeFileSync(
      join(root, "db-fixture.cts"),
      'const pg = require("pg");\nexports.client = new pg.Client();\n',
    );
    writeFileSync(
      join(root, "indirect.test.cts"),
      'const { client } = require("./db-fixture.cjs");\nvoid client;\n',
    );
    const result = classifyPackageTests({ packageKind: "api", rootDir: root });
    assert.deepEqual(result["api-postgres-standard"], ["indirect.test.cts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown test naming and non-DB runtime access fail actionably", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-unclassified-"));
  try {
    mkdirSync(join(root, "nested"));
    writeFileSync(
      join(root, "nested", "bypass.spec.ts"),
      "export const value = 1;\n",
    );
    assert.throws(
      () => classifyPackageTests({ packageKind: "api", rootDir: root }),
      /Unclassified test nested\/bypass\.spec\.ts/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.throws(
    () => assertExecutableDatabaseAccessAllowed("api-non-postgres"),
    /Real PostgreSQL access is forbidden.*api-non-postgres/,
  );
});
