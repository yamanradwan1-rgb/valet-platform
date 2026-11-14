import { defineConfig } from "vitest/config";

// Never run while migration113 recovery is blocked. Explicit release gate runs
// before W9 attestation/lease; all project tests are opt-in and NOT RUN to date.
export default defineConfig({
  test: {
    projects: [{
      test: {
        name: "issue416-quota-pg17",
        include: ["issue416-quota/*.integration.test.mjs"],
        maxWorkers: 1,
        fileParallelism: false,
        pool: "forks",
        globalSetup: ["./issue416-quota/pg17-quota-global-setup.mjs"],
      },
    }],
  },
});
