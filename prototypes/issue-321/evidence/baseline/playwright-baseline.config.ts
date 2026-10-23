import playwrightTest from "../../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { defineConfig } = playwrightTest;

export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  timeout: 180_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3003",
    browserName: "chromium",
  },
  reporter: "line",
  outputDir: "./test-artifacts",
});
