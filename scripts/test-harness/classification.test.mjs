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
  assert.equal(database["database-non-postgres"].length, 6);
  assert.equal(database["database-postgres-direct"].length, 41);
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
