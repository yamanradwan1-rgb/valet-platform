import { defineConfig } from "vitest/config";

// Isolated source-level KPI regression: no DB setup, CI fixture, or cleanup.
export default defineConfig({
  test: {
    include: ["test/dashboard-issue315-kpi-*.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
