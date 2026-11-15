import { defineConfig } from "vitest/config";

// Source-only S01 verification. No database fixture or shared PG preflight.
export default defineConfig({
  test: {
    include: [
      "test/staff-auth-writer-atomic.test.ts",
      "test/staff-auth-writer-boundary.test.ts",
      "test/staff-auth.service.test.ts",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    pool: "forks",
  },
});
