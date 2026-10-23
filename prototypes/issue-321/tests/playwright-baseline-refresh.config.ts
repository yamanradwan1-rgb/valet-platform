import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { defineConfig } = playwrightTest;

export default defineConfig({
  testDir: ".",
  testMatch: "qa-baseline-refresh.spec.ts",
  timeout: 180_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3003", browserName: "chromium" },
  reporter: "line",
  outputDir: "../evidence/qa/playwright-baseline-refresh-artifacts",
});
