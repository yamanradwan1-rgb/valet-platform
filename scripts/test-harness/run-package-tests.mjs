import { runHarnessCommand } from "./command-runner.mjs";
import { acquireInvocationLease } from "./invocation-lease.mjs";
import { ISSUE215_PROJECT } from "./issue215-test-manifest.mjs";

const packageKind = process.argv[2];
if (!new Set(["api", "database"]).has(packageKind)) {
  throw new Error("Usage: run-package-tests.mjs <api|database>.");
}

const lease = await acquireInvocationLease(`${packageKind}-package-tests`, {
  selectedProjects: packageKind === "database" ? [ISSUE215_PROJECT] : [],
});
const results = [];
try {
  results.push(
    await runHarnessCommand(["run", "test:non-postgres"], {
      label: `${packageKind}:non-postgres`,
    }),
  );
  results.push(
    await runHarnessCommand(["run", "test:postgres"], {
      label: `${packageKind}:postgres`,
    }),
  );
} finally {
  await lease.release();
}
if (results.some((result) => result.code !== 0)) process.exitCode = 1;
