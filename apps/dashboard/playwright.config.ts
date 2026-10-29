import { defineConfig } from "@playwright/test";

export default defineConfig({
  workers: 1,
  testDir: "./e2e",
  // Historical matched captures require explicit isolated-server inputs.
  // Keep ordinary E2E discovery usable without running their top-level guards.
  testIgnore: [
    ...(!process.env.ISSUE306_VARIANT ? ["**/issue306-matched-baseline.spec.ts"] : []),
    ...(!process.env.ISSUE314_VARIANT ? ["**/issue314-independent-acceptance.spec.ts"] : []),
  ],
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
