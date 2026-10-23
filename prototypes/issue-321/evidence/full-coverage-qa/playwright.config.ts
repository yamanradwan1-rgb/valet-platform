import { fileURLToPath } from "node:url";
import playwrightTest from "../../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { defineConfig } = playwrightTest;

export default defineConfig({
  testDir: fileURLToPath(new URL("../../", import.meta.url)),
  testMatch: ["**/tests/full-coverage-qa.spec.ts", "**/evidence/full-coverage-qa/persistence-regression.spec.ts",
    "**/tests/route-aria-qa.spec.ts"],
  timeout: 600_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3321",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  reporter: "line",
  outputDir: fileURLToPath(new URL("./playwright-artifacts/", import.meta.url)),
});
