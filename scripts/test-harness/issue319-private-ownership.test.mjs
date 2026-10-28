import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyPackageTests, discoverTests } from "./test-classification.mjs";

test("Issue319 private PostgreSQL tests are not collected as ordinary CI tests", () => {
  const rootDir = fileURLToPath(new URL("../../apps/api/test/", import.meta.url));
  const owner = classifyPackageTests({ packageKind: "api", rootDir });
  const expected = discoverTests(rootDir)
    .map((file) => file.replaceAll("\\", "/").split("/").at(-1))
    .filter((file) => /^dashboard-issue319-[^/]+\.integration\.test\.ts$/.test(file))
    .sort();
  assert.ok(expected.length > 0, "private cluster suites must remain discoverable");
  assert.deepEqual(owner["api-postgres-issue319-private"], expected);
  for (const [project, files] of Object.entries(owner)) {
    if (project === "api-postgres-issue319-private") continue;
    assert.equal(files.some((file) => expected.includes(file)), false, project);
  }
});
