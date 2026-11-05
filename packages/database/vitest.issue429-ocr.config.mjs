import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { preflightIssue429BeforeLease } from "./issue429-private/target-preflight.mjs";

const harness = fileURLToPath(
  new URL("../../scripts/test-harness/", import.meta.url),
);
const privateSetup = fileURLToPath(
  new URL("./issue429-private/global-setup.mjs", import.meta.url),
);

// Async config evaluation precedes Vitest globalSetup, worker setup, all
// PostgreSQL lease acquisition, stale-owner recovery, and migration DDL.
export default defineConfig(async () => {
  await preflightIssue429BeforeLease();
  return {
    test: {
      projects: [
        {
          test: {
            name: "database-postgres-issue429-ocr",
            include: ["issue429-private/ocr-admission.integration.test.ts"],
            pool: "forks",
            fileParallelism: false,
            maxWorkers: 1,
            env: {
              VAYLET_TEST_PROJECT: "database-postgres-issue429-ocr",
              VAYLET_POSTGRES_PROFILE: "database-provision",
            },
            setupFiles: [`${harness}vitest-postgres-setup.mjs`],
            globalSetup: [privateSetup],
          },
        },
      ],
    },
  };
});
