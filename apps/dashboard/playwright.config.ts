import { defineConfig } from "@playwright/test";

export default defineConfig({
  workers: 1,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3003",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @valet/contracts build && pnpm dev",
        port: 3003,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
