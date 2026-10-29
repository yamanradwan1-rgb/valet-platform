import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  approvedApiSourceTests,
  assertRegisteredApiSourceTests,
} from "./api-source-adjacent-ownership.mjs";
import { classifyPackageTests, discoverTests } from "./test-classification.mjs";

const apiRoot = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const sourceRoot = join(apiRoot, "src");

test("three source-adjacent tracking suites belong to exactly one non-PostgreSQL project", () => {
  const owned = classifyPackageTests({ packageKind: "api", rootDir: join(apiRoot, "test") });
  const expected = approvedApiSourceTests.map((file) => `src/${file}`).sort();
  const actual = Object.values(owned).flat().filter((file) => file.startsWith("src/")).sort();
  assert.deepEqual(actual, expected);
  assert.deepEqual(owned["api-non-postgres"].filter((file) => file.startsWith("src/")).sort(), expected);
  for (const [project, files] of Object.entries(owned)) {
    if (project === "api-non-postgres") continue;
    assert.equal(files.some((file) => file.startsWith("src/")), false, project);
  }
  assert.equal(discoverTests(sourceRoot).length, 3);
});

test("future source-adjacent tests fail ownership verification until registered", () => {
  const known = approvedApiSourceTests.map((file) => join(sourceRoot, file));
  assert.throws(
    () => assertRegisteredApiSourceTests(
      [...known, join(sourceRoot, "modules", "tracking", "future-tracker.test.ts")],
      sourceRoot,
    ),
    /Unowned API source-adjacent test src\/modules\/tracking\/future-tracker\.test\.ts/,
  );
  assert.throws(
    () => assertRegisteredApiSourceTests(known.slice(1), sourceRoot),
    /Registered API source-adjacent test missing from discovery/,
  );
});
