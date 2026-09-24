import { defineConfig } from "@playwright/test";

export default defineConfig({
  workers: 1,
  testDir: "./e2e-runtime",
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3003",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
