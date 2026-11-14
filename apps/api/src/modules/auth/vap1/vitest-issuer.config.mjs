import { defineConfig } from "vitest/config";

// Isolated source-only worker tests; the repository's owned-test classifier
// deliberately restricts its standard API projects to apps/api/test/*.test.ts.
// This config must not import PG setup or grant runtime proof-issuer authority.
export default defineConfig({
  test: {
    include: ["src/modules/auth/vap1/vap1-issuer-boundary.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
