import { runHarnessCommand } from "./command-runner.mjs";
import { acquireInvocationLease } from "./invocation-lease.mjs";

const [config, ...projects] = process.argv.slice(2);
if (!config || projects.length === 0) {
  throw new Error(
    "Usage: run-postgres-projects.mjs <config> <project> [project...].",
  );
}

const lease = await acquireInvocationLease(
  `postgres-projects-${projects.join("-")}`,
);
let failed = false;
try {
  for (const project of projects) {
    try {
      const result = await runHarnessCommand(
        ["exec", "vitest", "run", "--config", config, "--project", project],
        { label: project },
      );
      if (result.code !== 0) failed = true;
    } finally {
      await lease.cleanup();
    }
  }
} finally {
  await lease.release();
}
if (failed) process.exitCode = 1;
