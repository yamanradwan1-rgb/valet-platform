import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyPackageTests } from "./test-classification.mjs";
import {
  ISSUE215_API_PROJECT,
  ISSUE215_PROJECT,
  issue215ApiPostgresFiles,
  isIssue215ApiPostgresFile,
  isIssue215ProtectedProject,
} from "./issue215-test-manifest.mjs";
import {
  requiresIssue215Preflight,
  requiresIssue215StaleOwnerPreflight,
} from "./issue215-target-preflight.mjs";
import { postgresProfileForProject } from "./resource-budget.mjs";
import { requireIssue215TestUrl } from "../../packages/database/src/condition-photo-p1-test-target.mjs";

const valid = {
  NODE_ENV: "test",
  TEST_DATABASE_URL: "postgresql://issue215_owner:fake@127.0.0.1:58487/issue215_empty",
  VAYLET_TEST_PROJECT: ISSUE215_API_PROJECT,
  VAYLET_TEST_RUN_ID: "owned-test-run",
};

test("reviewed #215 and #309 exact API tests alone enter the protected Issue215 PostgreSQL project", () => {
  assert.deepEqual(issue215ApiPostgresFiles, [
    "issue215-policy-recovery.test.ts",
    "issue215-real-http-integration.test.ts",
    "issue215-real-http-negative.test.ts",
    "issue215-real-nest-hardkill.integration.test.ts",
    "issue215-recovery-real-s3.integration.test.ts",
    "issue215-recovery.integration.test.ts",
    "issue215-staff-credential-races.test.ts",
    "issue309-photo-grant-race.integration.test.ts",
    "issue309-photo-viewer.integration.test.ts",
  ]);
  const apiRoot = fileURLToPath(new URL("../../apps/api/test/", import.meta.url));
  const classified = classifyPackageTests({ packageKind: "api", rootDir: apiRoot });
  assert.deepEqual(classified[ISSUE215_API_PROJECT], issue215ApiPostgresFiles);
  for (const [projectName, files] of Object.entries(classified)) {
    if (projectName === ISSUE215_API_PROJECT) continue;
    assert.ok(files.every((file) => !issue215ApiPostgresFiles.includes(file)));
  }
  assert.equal(postgresProfileForProject(ISSUE215_API_PROJECT).name, "api-race");
});

test("protected project ownership includes API but rejects name and CLI-like impostors", () => {
  assert.equal(isIssue215ProtectedProject(ISSUE215_API_PROJECT), true);
  assert.equal(isIssue215ProtectedProject(ISSUE215_PROJECT), true);
  assert.equal(requiresIssue215Preflight([ISSUE215_API_PROJECT]), true);
  assert.equal(requiresIssue215Preflight(["api-postgres-race"]), false);
  assert.equal(requiresIssue215Preflight(["api-postgres-issue215-mimic"]), false);
  assert.equal(requiresIssue215StaleOwnerPreflight({ projectName: ISSUE215_API_PROJECT }), true);
  assert.equal(requiresIssue215StaleOwnerPreflight({ projectName: ISSUE215_API_PROJECT, issue215Protected: false }), false);
});

test("API project requires the same pinned disposable container URL and ownership identity", () => {
  assert.equal(requireIssue215TestUrl(valid), valid.TEST_DATABASE_URL);
  for (const changed of [
    { VAYLET_TEST_PROJECT: "api-postgres-race" },
    { VAYLET_TEST_PROJECT: "api-postgres-issue215-mimic" },
    { VAYLET_TEST_RUN_ID: undefined },
    { TEST_DATABASE_URL: valid.TEST_DATABASE_URL.replace("issue215_empty", "valet") },
    { TEST_DATABASE_URL: valid.TEST_DATABASE_URL.replace("127.0.0.1", "10.0.0.1") },
    { PGOPTIONS: "-c search_path=other" },
    { NODE_ENV: "production" },
  ]) {
    assert.throws(() => requireIssue215TestUrl({ ...valid, ...changed }), /Issue 215 test target/);
  }
});

test("every protected API basename rejects missing DB signal and excludes near-matches", () => {
  for (const protectedFile of issue215ApiPostgresFiles) {
    const scratch = mkdtempSync(join(tmpdir(), "vaylet-issue215-api-classification-"));
    try {
      writeFileSync(join(scratch, protectedFile), "export const value = 1;\n");
      assert.throws(
        () => classifyPackageTests({ packageKind: "api", rootDir: scratch }),
        /protected API test.*lost PostgreSQL ownership/,
      );
      writeFileSync(join(scratch, protectedFile),
        'import { Pool } from "pg"; const pool = new Pool(); void pool;\n');
      const lookalike = protectedFile.replace(".test.ts", "-extra.test.ts");
      const nearMatch = protectedFile.replace(/\.test\.ts$/, ".spec.ts");
      writeFileSync(join(scratch, lookalike),
        'import { Pool } from "pg"; const pool = new Pool(); void pool;\n');
      assert.equal(isIssue215ApiPostgresFile(protectedFile), true);
      assert.equal(isIssue215ApiPostgresFile(lookalike), false);
      assert.equal(isIssue215ApiPostgresFile(nearMatch), false);
      assert.equal(isIssue215ApiPostgresFile(`prefix-${protectedFile}`), false);
      const classified = classifyPackageTests({ packageKind: "api", rootDir: scratch });
      assert.deepEqual(classified[ISSUE215_API_PROJECT], [protectedFile]);
      assert.ok(Object.entries(classified).some(([project, files]) =>
        project !== ISSUE215_API_PROJECT && files.includes(lookalike)));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
