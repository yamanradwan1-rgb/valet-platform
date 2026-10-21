import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { postgresProfile } from "../../scripts/test-harness/resource-budget.mjs";
import { classifyPackageTests } from "../../scripts/test-harness/test-classification.mjs";

const testRoot = fileURLToPath(new URL("./test/", import.meta.url));
const harnessRoot = fileURLToPath(
  new URL("../../scripts/test-harness/", import.meta.url),
);
const ownership = classifyPackageTests({
  packageKind: "api",
  rootDir: testRoot,
});

function ownedFiles(projectName) {
  const files = ownership[projectName] ?? [];
  if (files.length === 0)
    throw new Error(`Vitest project ${projectName} owns zero tests.`);
  // Node's own test runner owns native node:test .mjs suites. The package
  // test script executes these separately, so Vitest must not collect them
  // as zero-test suites (which otherwise fails CI without running the tests).
  return files.filter((file) => !file.endsWith(".test.mjs"))
    .map((file) => `test/${file}`);
}

function postgresProject(projectName, profileName) {
  const profile = postgresProfile(profileName);
  return {
    test: {
      name: projectName,
      include: ownedFiles(projectName),
      pool: "forks",
      fileParallelism: true,
      maxWorkers: profile.fileWorkers,
      env: {
        VAYLET_TEST_PROJECT: projectName,
        VAYLET_POSTGRES_PROFILE: profileName,
      },
      setupFiles: [`${harnessRoot}vitest-postgres-setup.mjs`],
      globalSetup: [`${harnessRoot}vitest-postgres-global.mjs`],
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "api-non-postgres",
          include: ownedFiles("api-non-postgres"),
          env: { VAYLET_TEST_PROJECT: "api-non-postgres" },
          setupFiles: [`${harnessRoot}vitest-non-postgres-setup.mjs`],
        },
      },
      postgresProject("api-postgres-standard", "api-standard"),
      postgresProject("api-postgres-compound", "api-compound"),
      postgresProject("api-postgres-race", "api-race"),
      postgresProject("api-postgres-issue215", "api-race"),
      postgresProject("api-postgres-issue309-browser", "api-photo-browser"),
    ],
  },
});
