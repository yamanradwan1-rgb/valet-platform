import { defineConfig } from "vitest/config";

// Isolated opt-in PG17 instance only. Never use the default CI PG harness.
export default defineConfig({
  test: {
    include: ["test/dashboard-issue315-kpi-*.integration.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 25_000,
    hookTimeout: 180_000,
  },
});
