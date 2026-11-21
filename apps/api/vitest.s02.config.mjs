// Worker-33 ONLY. Never run against the generic default PostgreSQL target.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const raw = process.env.TEST_DATABASE_URL;
if (process.env.ISSUE416_S02_PROTECTED_TEST !== "1" || !raw) {
  throw new Error("Explicit W33 dedicated MFA PostgreSQL fixture required.");
}
const target = new URL(raw);
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "45533" ||
  target.pathname !== "/issue416_w33_s02_fresh2" ||
  target.username !== "issue416_w33_s02_owner"
) {
  throw new Error("MFA HTTP tests may not target shared PostgreSQL.");
}

export default defineConfig({
  resolve: {
    alias: [{
      find: /^@valet\/contracts$/,
      replacement: fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
    }],
  },
  test: {
    include: [
      "test/staff-mfa-enrollment.integration.test.ts",
      "test/mfa-admin-activity.integration.test.ts",
      "test/staff-mfa-assurance.integration.test.ts",
      "test/staff-mfa-security.integration.test.ts",
      "test/issue416-s02-mounted-forgery.integration.test.ts",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
