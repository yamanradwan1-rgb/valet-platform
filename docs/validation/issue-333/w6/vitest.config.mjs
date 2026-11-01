import { defineConfig } from 'vitest/config';

// Opt-in PostgreSQL test project: each run must be started by the owned lab.
export default defineConfig({
  test: {
    include: ['test/dashboard-issue333-*.integration.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
