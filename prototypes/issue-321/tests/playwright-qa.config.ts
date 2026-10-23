import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { defineConfig } = playwrightTest;

export default defineConfig({
  testDir: ".",
  testMatch: "qa-*.spec.ts",
  testIgnore: "qa-baseline-refresh.spec.ts",
  timeout: 300_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3321",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
  },
  reporter: "line",
  outputDir: "../evidence/qa/playwright-artifacts",
});
