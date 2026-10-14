import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { postgresProfile } from "../../scripts/test-harness/resource-budget.mjs";
import { classifyPackageTests } from "../../scripts/test-harness/test-classification.mjs";
import { ISSUE215_PROJECT } from "../../scripts/test-harness/issue215-test-manifest.mjs";

const sourceRoot = fileURLToPath(new URL("./src/", import.meta.url));
const harnessRoot = fileURLToPath(
  new URL("../../scripts/test-harness/", import.meta.url),
);
const ownership = classifyPackageTests({
  packageKind: "database",
  rootDir: sourceRoot,
});

function ownedFiles(projectName) {
  const files = ownership[projectName] ?? [];
  if (files.length === 0)
    throw new Error(`Vitest project ${projectName} owns zero tests.`);
  return files.map((file) => `src/${file}`);
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
          name: "database-non-postgres",
          include: ownedFiles("database-non-postgres"),
          env: { VAYLET_TEST_PROJECT: "database-non-postgres" },
          setupFiles: [`${harnessRoot}vitest-non-postgres-setup.mjs`],
        },
      },
      postgresProject("database-postgres-direct", "database-direct"),
      postgresProject("database-postgres-provision", "database-provision"),
      postgresProject(ISSUE215_PROJECT, "database-provision"),
    ],
  },
});
