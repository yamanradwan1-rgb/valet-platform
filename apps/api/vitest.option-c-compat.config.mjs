import { defineConfig } from "vitest/config";

// Real mounted HTTP and concurrency compatibility, opt-in on the same
// independently attested W37 PostgreSQL 17 target as the T5 probes.
export default defineConfig({
  test: {
    include: [
      "test/staff-mfa-session-races.integration.test.ts",
      "test/staff-management-deactivation-refresh-race.integration.test.ts",
      "test/staff-management-deactivation.integration.test.ts",
      "test/staff-management-lm-mutations.integration.test.ts",
      "test/staff-push-registration-authority.integration.test.ts",
      // #316 full Staff→Guest suite hardcodes :5432/valet and deliberately
      // rejects the separately attested W37 target. This guest suite mounts
      // the real Guest controller on its own disposable PG fixture instead.
      "test/guest-information-persisted-http.integration.test.ts",
    ],
    setupFiles: ["test/issue416-option-c-t5/owned-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
