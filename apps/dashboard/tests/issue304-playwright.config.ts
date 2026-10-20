import { defineConfig } from "@playwright/test";

// Explicitly opt-in: never starts an app or a browser server implicitly.
export default defineConfig({
  testDir: ".",
  testMatch: "issue304-*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "../../docs/validation/issue304-w6/results.json" }]],
  outputDir: "../../docs/validation/issue304-w6/playwright-artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3003",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "issue304-chromium", use: { browserName: "chromium" } }],
});
