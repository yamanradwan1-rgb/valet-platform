import { defineConfig } from "vitest/config";

// BEFORE-only proof: intentionally red when SQL actor UUID/PHC origins remain
// exploitable, and never selected by the AFTER gate or ordinary CI discovery.
export default defineConfig({
  test: {
    include: ["test/issue416-option-c-after/*.before.ts"],
    setupFiles: ["test/issue416-option-c-after/after-owned-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 180_000,
  },
});
