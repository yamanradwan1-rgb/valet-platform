import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { postgresProfile } from "../../scripts/test-harness/resource-budget.mjs";
import { preflightIssue414Phase23HttpBeforeLease } from "../../scripts/test-harness/issue414-phase23-http-target.mjs";
import { classifyPackageTests } from "../../scripts/test-harness/test-classification.mjs";

const testRoot = fileURLToPath(new URL("./test/", import.meta.url));
const harnessRoot = fileURLToPath(
  new URL("../../scripts/test-harness/", import.meta.url),
);
const ownership = classifyPackageTests({
  packageKind: "api",
  rootDir: testRoot,
});

// Vitest --project supports patterns, wildcards and repeated selectors.
// ONLY an exact, single, non-race project may bypass P23 target preflight.
// Every other selection could include the P23-owned race project, whose
// globalSetup must never run after another project's lease or cleanup.
const requestedProjects = [];
for (let index = 0; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--project") {
    requestedProjects.push(process.argv[++index] ?? "");
  } else if (arg.startsWith("--project=")) {
    requestedProjects.push(arg.slice("--project=".length));
  }
}
const onlySafeOtherProject =
  requestedProjects.length === 1 &&
  requestedProjects[0] !== "api-postgres-race" &&
  Object.hasOwn(ownership, requestedProjects[0]);
const includesP23File = process.argv.some((part) =>
  /(?:^|[\\/])management-alert-phase23-http\.integration\.test\.ts$/.test(part),
);
// The configuration is also imported as data by Node's read-only
// classification tests; those imports never start Vitest or PG globalSetup.
// Every actual CLI invocation has the Vitest executable as argv[1].
const vitestCliInvocation = /(?:^|[\\/])vitest(?:\.mjs|\.js)?$/.test(
  process.argv[1] ?? "",
);
if (vitestCliInvocation && (!onlySafeOtherProject || includesP23File)) {
  // This async read-only attestation completes before *any* selected project's
  // globalSetup. Checking URL format alone is not sufficient for a multi-
  // project launch where an unrelated project may enter PG first.
  await preflightIssue414Phase23HttpBeforeLease();
}
const privateIssue319Project = "api-postgres-issue319-private";
const privateIssue333Project = "api-postgres-issue333-private";
const privateIssue333W4Project = "api-postgres-issue333-w4-private";

function ownedFiles(projectName) {
  const files = ownership[projectName] ?? [];
  if (files.length === 0)
    throw new Error(`Vitest project ${projectName} owns zero tests.`);
  // Node's own test runner owns native node:test .mjs suites. The package
  // test script executes these separately, so Vitest must not collect them
  // as zero-test suites (which otherwise fails CI without running the tests).
  return files
    .filter((file) => !file.endsWith(".test.mjs"))
    .map((file) => (file.startsWith("src/") ? file : `test/${file}`));
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
      ...(process.env.CI !== "true" &&
      process.env.ISSUE319_EPHEMERAL_PG === "I_OWN_THIS_CLUSTER"
        ? [
            {
              test: {
                name: privateIssue319Project,
                include: ownedFiles(privateIssue319Project),
                pool: "forks",
                fileParallelism: false,
                maxWorkers: 1,
                env: { VAYLET_TEST_PROJECT: privateIssue319Project },
              },
            },
          ]
        : []),
      ...(process.env.CI !== "true" &&
      process.env.ISSUE333_EPHEMERAL_PG === "I_OWN_THIS_CLUSTER"
        ? [
            {
              test: {
                name: privateIssue333Project,
                include: ownedFiles(privateIssue333Project),
                pool: "forks",
                fileParallelism: false,
                maxWorkers: 1,
                env: { VAYLET_TEST_PROJECT: privateIssue333Project },
              },
            },
          ]
        : []),
      ...(process.env.CI !== "true" &&
      process.env.ISSUE333_W4_PRIVATE_PG === "I_OWN_W4_CLUSTER"
        ? [
            {
              test: {
                name: privateIssue333W4Project,
                include: ownedFiles(privateIssue333W4Project),
                pool: "forks",
                fileParallelism: false,
                maxWorkers: 1,
                env: { VAYLET_TEST_PROJECT: privateIssue333W4Project },
              },
            },
          ]
        : []),
    ],
  },
});
