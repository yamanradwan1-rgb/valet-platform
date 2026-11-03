import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyPackageTests, discoverTests } from "./test-classification.mjs";
import {
  ISSUE215_PROJECT,
  issue215PostgresFiles,
} from "./issue215-test-manifest.mjs";

function discoveredNames(rootDir) {
  return discoverTests(rootDir).map((file) =>
    relative(rootDir, file).replaceAll("\\", "/"),
  );
}

function assertExactUniqueOwners(ownership, discovered) {
  const assigned = Object.values(ownership).flat();
  assert.equal(
    new Set(assigned).size,
    assigned.length,
    "a test must have one owner",
  );
  assert.deepEqual([...assigned].sort(), [...discovered].sort());
}

test("all discovered API and database tests have one exact, reviewed owner", () => {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const apiRoot = join(repositoryRoot, "apps", "api", "test");
  const apiSourceRoot = join(repositoryRoot, "apps", "api", "src");
  const databaseRoot = join(repositoryRoot, "packages", "database", "src");
  const api = classifyPackageTests({ packageKind: "api", rootDir: apiRoot });
  const database = classifyPackageTests({
    packageKind: "database",
    rootDir: databaseRoot,
  });

  assertExactUniqueOwners(api, [
    ...discoveredNames(apiRoot),
    ...discoveredNames(apiSourceRoot).map((file) => `src/${file}`),
  ]);
  assertExactUniqueOwners(database, discoveredNames(databaseRoot));

  assert.deepEqual(
    new Set(Object.keys(database)),
    new Set([
      "database-non-postgres",
      "database-postgres-direct",
      "database-postgres-provision",
      ISSUE215_PROJECT,
    ]),
  );
  assert.ok(
    database["database-non-postgres"].includes(
      "issue304-migration-source-appendix.test.ts",
    ),
  );
  assert.ok(
    database["database-postgres-direct"].includes(
      "issue309-photo-scope-migration.integration.test.ts",
    ),
  );
  assert.ok(
    database["database-postgres-direct"].includes(
      "issue363-mfa-owner-deletion.integration.test.ts",
    ),
  );
  assert.ok(
    database["database-postgres-provision"].includes(
      "rating-analytics-runtime-role.integration.test.ts",
    ),
  );
  assert.ok(
    database["database-postgres-provision"].includes(
      "visit-contact-runtime-role.integration.test.ts",
    ),
  );
  assert.deepEqual(database[ISSUE215_PROJECT], issue215PostgresFiles);
  assert.ok(api["api-non-postgres"].includes("postgres.test.ts"));
  assert.ok(
    api["api-non-postgres"].includes("shift-test-context-names.test.ts"),
  );
  assert.ok(
    Object.entries(api)
      .filter(([project]) => project.includes("postgres"))
      .flatMap(([, files]) => files)
      .includes("provision-staff.integration.test.ts"),
  );
});

test("adding ordinary database suites changes discovery, not fixed lane-count expectations", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-ownership-growth-"));
  try {
    writeFileSync(
      join(root, "original-direct.integration.test.ts"),
      'import { Client } from "pg";\nnew Client();\n',
    );
    writeFileSync(
      join(root, "original-pure.test.ts"),
      "export const pure = true;\n",
    );
    const before = classifyPackageTests({
      packageKind: "database",
      rootDir: root,
    });
    assertExactUniqueOwners(before, discoveredNames(root));

    writeFileSync(
      join(root, "added-direct.integration.test.ts"),
      'import { Pool } from "pg";\nnew Pool();\n',
    );
    writeFileSync(
      join(root, "added-provision.integration.test.ts"),
      'import { Client } from "pg";\nimport "node:child_process";\nnew Client();\n',
    );
    writeFileSync(
      join(root, "added-pure.test.ts"),
      "export const pure = true;\n",
    );
    const after = classifyPackageTests({
      packageKind: "database",
      rootDir: root,
    });
    assertExactUniqueOwners(after, discoveredNames(root));
    assert.deepEqual(
      after["database-postgres-direct"],
      [
        ...before["database-postgres-direct"],
        "added-direct.integration.test.ts",
      ].sort(),
    );
    assert.deepEqual(after["database-postgres-provision"], [
      "added-provision.integration.test.ts",
    ]);
    assert.deepEqual(
      after["database-non-postgres"],
      [...before["database-non-postgres"], "added-pure.test.ts"].sort(),
    );
    assert.equal(after[ISSUE215_PROJECT], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
