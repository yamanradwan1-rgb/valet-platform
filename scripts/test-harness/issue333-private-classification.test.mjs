import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { classifyPackageTests } from "./test-classification.mjs";

test("Issue333 private PostgreSQL races never join default CI projects", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-issue333-classifier-"));
  try {
    for (const name of [
      "dashboard-issue333-live-map.integration.test.ts",
      "dashboard-issue333-scope-races.integration.test.ts",
      "dashboard-issue333-scope-rollback.integration.test.ts",
      "dashboard-issue333-harness.integration.test.ts",
      "issue333-w4-visit-contacts.integration.test.ts",
      "ordinary.integration.test.ts",
    ]) {
      writeFileSync(join(root, name), "export const marker = 1;\n");
    }
    const projects = classifyPackageTests({
      packageKind: "api",
      rootDir: root,
    });
    assert.deepEqual(projects["api-postgres-issue333-private"], [
      "dashboard-issue333-harness.integration.test.ts",
      "dashboard-issue333-live-map.integration.test.ts",
      "dashboard-issue333-scope-races.integration.test.ts",
      "dashboard-issue333-scope-rollback.integration.test.ts",
    ]);
    assert.deepEqual(projects["api-postgres-issue333-w4-private"], [
      "issue333-w4-visit-contacts.integration.test.ts",
    ]);
    assert.deepEqual(projects["api-non-postgres"], [
      "ordinary.integration.test.ts",
    ]);
    assert.equal(Object.values(projects).flat().length, 6);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary CI Vitest projects exclude all Issue333 private cases", async () => {
  const previousCi = process.env.CI;
  process.env.CI = "true";
  try {
    const { default: config } =
      await import("../../apps/api/vitest.config.mjs");
    const projects = config.test.projects;
    const names = projects.map((project) => project.test.name);
    const files = projects.flatMap((project) => project.test.include);
    assert.equal(
      names.some((name) => name.includes("issue333")),
      false,
    );
    assert.equal(
      files.some((file) => /issue333/i.test(file)),
      false,
    );
    assert.equal(names.includes("api-postgres-issue319-private"), false);
  } finally {
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
  }
});
