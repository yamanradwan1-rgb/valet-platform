import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
} from "./issue215-target-preflight.mjs";

test("Issue 215 P1 preflight precedes every relevant PostgreSQL harness cleanup entry", () => {
  assert.equal(requiresIssue215Preflight("focused-database", ["node", "src/condition-photo-runtime-privileges.integration.test.ts"]), true);
  assert.equal(requiresIssue215Preflight("focused-database", ["node", "src/unrelated.integration.test.ts"]), false);
  assert.equal(requiresIssue215Preflight("database-postgres-provision", ["node", "src/condition-photo-p1-integrity.integration.test.ts"]), true);
  assert.equal(requiresIssue215Preflight("database-postgres-provision", ["node", "--exclude", "src/unrelated.test.ts"]), true);
  assert.equal(requiresIssue215Preflight("database-postgres-provision", ["node", "--changed", "src/unrelated.test.ts"]), true);
  assert.equal(requiresIssue215Preflight("database-postgres-provision", ["node", "src/unrelated.test.ts"]), true);
  assert.equal(requiresIssue215Preflight("database-postgres-provision", ["node", "--reporter=json", "--outputFile", "src/unrelated.test.ts"]), true);
  assert.equal(requiresIssue215Preflight("database-postgres-direct", ["node", "src/condition-photo-p1-owned-target.test.ts"]), true);
  assert.equal(requiresIssue215Preflight("database-postgres-provision", ["node"]), true);
  assert.equal(requiresIssue215Preflight("postgres-projects-database-postgres-direct-database-postgres-provision"), true);
  assert.equal(requiresIssue215Preflight("database-package-tests"), true);
  assert.equal(requiresIssue215Preflight("root-tests", ["node", "--postgres-only"]), true);
  assert.equal(requiresIssue215Preflight("root-tests", ["node", "--non-postgres-only"]), false);
});

test("Issue 215 P1 rejects missing target despite a migration URL before acquiring a cluster lease", async () => {
  const before = process.env.TEST_DATABASE_URL;
  const migration = process.env.MIGRATION_DATABASE_URL;
  try {
    delete process.env.TEST_DATABASE_URL;
    process.env.MIGRATION_DATABASE_URL = "postgresql://fake:fake@db.example.invalid:5432/valet";
    await assert.rejects(
      preflightIssue215BeforeHarnessCleanup("focused-database", ["node", "src/condition-photo-runtime-privileges.integration.test.ts"]),
      /Issue 215 test target/,
    );
  } finally {
    if (before === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = before;
    if (migration === undefined) delete process.env.MIGRATION_DATABASE_URL;
    else process.env.MIGRATION_DATABASE_URL = migration;
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
  assert.equal(database["database-postgres-direct"].length, 42);
  assert.equal(database["database-postgres-provision"].length, 47);
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
