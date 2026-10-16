import { runHarnessCommand } from "./command-runner.mjs";
import { acquireInvocationLease } from "./invocation-lease.mjs";
import { ISSUE215_PROJECT } from "./issue215-test-manifest.mjs";

const postgresOnly = process.argv.includes("--postgres-only");
const nonPostgresOnly = process.argv.includes("--non-postgres-only");
if (postgresOnly && nonPostgresOnly)
  throw new Error("Choose at most one root test lane selector.");

const results = [];
const lease = nonPostgresOnly
  ? { release: async () => {} }
  : await acquireInvocationLease("root-tests", { selectedProjects: [ISSUE215_PROJECT] });
try {
  if (!postgresOnly) {
    // Keep the heavyweight pure, API and database suites within one bounded
    // process budget. Their results still aggregate even if one lane fails.
    results.push(
      await runHarnessCommand(
        [
          "turbo", "run", "test", "--concurrency=1",
          "--filter=!@valet/api", "--filter=!@valet/database",
        ],
        { label: "root:pure-turbo" },
      ),
    );
    results.push(
      await runHarnessCommand(["--filter", "@valet/api", "test:non-postgres"], {
        label: "api:non-postgres",
      }),
    );
    results.push(
      await runHarnessCommand(["--filter", "@valet/database", "test:non-postgres"], {
        label: "database:non-postgres",
      }),
    );
  }

  if (!nonPostgresOnly) {
    results.push(
      await runHarnessCommand(["--filter", "@valet/api", "test:postgres"], {
        label: "api:postgres",
      }),
    );
    results.push(
      await runHarnessCommand(
        ["--filter", "@valet/database", "test:postgres"],
        {
          label: "database:postgres",
        },
      ),
    );
  }
} finally {
  await lease.release();
}

if (results.some((result) => result.code !== 0)) process.exitCode = 1;
