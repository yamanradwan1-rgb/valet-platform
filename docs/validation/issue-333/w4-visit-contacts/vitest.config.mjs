import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/issue333-w4-visit-contacts.integration.test.ts", "test/issue333-w4-mixed-privacy.integration.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
