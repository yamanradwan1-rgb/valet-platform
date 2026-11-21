import { defineConfig } from "vitest/config";

// This config is only for a final SHA integrating all required dedicated DB
// writer modules and official provisioners. Missing contracts fail at setup;
// there is no ordinary runtime-pool fallback or mocked writer credential.
export default defineConfig({
  test: {
    include: ["test/issue416-option-c-after/*.protected.ts"],
    setupFiles: ["test/issue416-option-c-after/after-protected-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 180_000,
  },
});
