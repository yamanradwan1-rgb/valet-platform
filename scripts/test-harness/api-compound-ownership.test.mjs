import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyPackageTests } from "./test-classification.mjs";
import { postgresProfileForProject } from "./resource-budget.mjs";

const fixture = "guest-t4-mutation-retry.integration.test.ts";

test("Guest T4's three simultaneous pools use the bounded compound project", () => {
  const apiRoot = fileURLToPath(new URL("../../apps/api/test/", import.meta.url));
  const actual = classifyPackageTests({ packageKind: "api", rootDir: apiRoot });
  assert.ok(actual["api-postgres-compound"].includes(fixture));
  assert.equal(actual["api-postgres-standard"].includes(fixture), false);
  assert.equal(postgresProfileForProject("api-postgres-standard").poolCount, 2);
  assert.equal(postgresProfileForProject("api-postgres-compound").poolCount, 3);
});

test("exact-name compound ownership requires real DB signal and does not widen to lookalikes", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-guest-t4-ownership-"));
  try {
    writeFileSync(join(root, fixture), "export const testFixture = true;\n");
    assert.deepEqual(classifyPackageTests({ packageKind: "api", rootDir: root }), {
      "api-non-postgres": [fixture],
    });
    writeFileSync(join(root, fixture), "createRuntimePostgresPool('test');\n");
    writeFileSync(join(root, "guest-t4-mutation-retry-extra.integration.test.ts"),
      "createRuntimePostgresPool('test');\n");
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", fixture), "createRuntimePostgresPool('test');\n");
    const actual = classifyPackageTests({ packageKind: "api", rootDir: root });
    assert.deepEqual(actual["api-postgres-compound"], [fixture]);
    assert.deepEqual(actual["api-postgres-standard"], [
      "guest-t4-mutation-retry-extra.integration.test.ts",
      `nested/${fixture}`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
