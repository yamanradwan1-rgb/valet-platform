import { defineConfig } from "vitest/config";

// W69 source-only session authority verification. No database fixture/setup.
export default defineConfig({
  test: {
    include: [
      "test/staff-session-lock.test.ts",
      "test/staff-response-user-revalidation.test.ts",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    pool: "forks",
  },
});
