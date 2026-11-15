import { defineConfig } from "vitest/config";

// Opt-in AFTER-only security gates: intentionally RED until protected writers
// replace the legacy SQL grants. The historical BEFORE .probe.ts suite is not
// collected, and this is not part of default CI discovery.
export default defineConfig({
  test: {
    include: ["test/issue416-option-c-after/*.after.ts"],
    setupFiles: ["test/issue416-option-c-after/after-owned-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 180_000,
  },
});
