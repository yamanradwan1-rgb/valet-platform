import { defineConfig } from "vitest/config";

// Permanently fail-closed pending W9 independently attested lease ownership.
// Even a textual Owner release flag cannot connect or run these draft PG tests.
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
