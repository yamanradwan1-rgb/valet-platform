import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/issue416-option-c-t5/*.probe.ts"],
    setupFiles: ["test/issue416-option-c-t5/owned-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
