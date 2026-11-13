import { defineConfig } from "vitest/config";

// This opt-in integration lane MUST NOT run before W9's 113–119 foundation
// is repaired/migrated and migration120 is reviewed/installed on that fixture.
export default defineConfig({
  test: {
    projects: [{
      test: {
        name: "issue416-quota-pg17",
        include: ["issue416-quota/*.integration.test.mjs"],
        maxWorkers: 1,
        fileParallelism: false,
        pool: "forks",
        globalSetup: ["./issue416-private/global-setup.mjs"],
      },
    }],
  },
});
