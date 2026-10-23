import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/dashboard-issue319-*.integration.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 25_000,
    hookTimeout: 180_000,
  },
});
