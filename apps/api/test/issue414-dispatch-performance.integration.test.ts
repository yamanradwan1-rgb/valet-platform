import { Pool } from "pg";
import { describe, it } from "vitest";
import { runIssue414DispatchPerformance } from "../tools/issue414-dispatch-performance";

const enabled =
  process.env.ISSUE414_W7_BENCH_ENABLE === "I_OWN_EXCLUSIVE_PG17_LEASE";

describe("Issue #414 W7 opt-in genuine PG17 ALT-02/03 performance profile", () => {
  (enabled ? it : it.skip)(
    "records exact SQL EXPLAIN BUFFERS and 20+100 warm concurrent CA/LM requests",
    async () => {
      // Direct real-PG bootstrap probe also registers this opt-in suite in
      // the repository's PostgreSQL (never non-Postgres) ownership profile.
      const probe = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        max: 1,
      });
      try {
        await probe.query("SELECT current_setting('server_version_num')");
      } finally {
        await probe.end();
      }
      await runIssue414DispatchPerformance();
    },
    900_000,
  );
});
