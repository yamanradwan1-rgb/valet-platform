import process from "node:process";
import { defineConfig } from "@playwright/test";
// A browser-mounted test suite kept in the #276 Live folder so established
// R03/R04 E2E fixtures and other production domains remain untouched.
export default defineConfig({
  workers: 1,
  testDir: ".",
  testMatch: "issue-276-*.e2e.mjs",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3003",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @valet/contracts build && pnpm dev",
        port: 3003,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
