import { defineConfig } from "vitest/config";

// Explicit opt-in, isolated PostgreSQL lab only. Run with CWD apps/api.
// Main repository CI test ownership and global setup remain untouched.
export default defineConfig({
  test: {
    include: ["test/dashboard-issue315-*.integration.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
