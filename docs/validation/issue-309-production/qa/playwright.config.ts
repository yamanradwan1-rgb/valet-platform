import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["react-frozen-parity.spec.ts", "react-photo-matrix.spec.ts", "diagnose-paint.spec.ts", "native200-react.spec.ts", "photo-focus-outline.spec.ts", "approved-photo-parity.spec.ts", "photo-resource-lifecycle.spec.ts"],
  workers: 1,
  timeout: 240_000,
  reporter: "line",
  use: {
    baseURL: process.env.ISSUE309_APP_URL ?? "http://127.0.0.1:3197",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
