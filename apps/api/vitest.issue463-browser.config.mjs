import { defineConfig } from "vitest/config";

// No default/CI database fallback. The proof independently attests and leases
// the exact disposable target before any fixture writes or application startup.
if (process.env.ISSUE463_BROWSER_QA !== "I_OWN_DISPOSABLE_463" ||
    process.env.NODE_ENV !== "test" || process.env.CI !== undefined) {
  throw new Error("Issue463 browser proof requires explicit local owned-target opt-in.");
}
export default defineConfig({test:{include:["test/issue463-rating-comments.browser.proof.ts"],pool:"forks",fileParallelism:false,maxWorkers:1,testTimeout:900000}});
