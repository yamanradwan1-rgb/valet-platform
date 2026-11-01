import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Local Issue #406 regression lane; API interception is explicit in the tests. */
export default defineConfig({
  ...base,
  testMatch: ["issue406-*.spec.ts", "issue407-*.spec.ts"],
  use: {
    ...base.use,
    launchOptions: process.env.ISSUE406_CHROMIUM_PATH
      ? { executablePath: process.env.ISSUE406_CHROMIUM_PATH }
      : {},
  },
});
