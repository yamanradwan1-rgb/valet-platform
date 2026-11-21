import { defineConfig } from "vitest/config";

// Dedicated PG17 lane: intentionally no generic PostgreSQL lease/cleanup setup.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "issue416-preflight-unit",
          include: ["issue416-private/*.unit.test.mjs"],
        },
      },
      {
        test: {
          name: "issue416-pg17-private",
          include: ["issue416-private/*.integration.test.mjs"],
          maxWorkers: 1,
          fileParallelism: false,
          pool: "forks",
          globalSetup: ["./issue416-private/global-setup.mjs"],
        },
      },
    ],
  },
});
