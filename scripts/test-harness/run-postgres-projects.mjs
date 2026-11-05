import { runHarnessCommand } from "./command-runner.mjs";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireInvocationLease } from "./invocation-lease.mjs";
import { preflightIssue414Phase23HttpBeforeLease } from "./issue414-phase23-http-target.mjs";

const [config, ...projects] = process.argv.slice(2);
if (!config || projects.length === 0) {
  throw new Error(
    "Usage: run-postgres-projects.mjs <config> <project> [project...].",
  );
}
// The private Issue429 test config attests a dedicated PG17 instance while
// loading. This generic runner acquires a lease *before* loading any config,
// so it cannot safely invoke that config, regardless of project selectors.
// Use direct Vitest with its independently gated private config instead.
const privateOcrConfig = fileURLToPath(
  new URL("../../packages/database/vitest.issue429-ocr.config.mjs", import.meta.url),
);
const selectedConfig = resolve(process.cwd(), config);
if (existsSync(selectedConfig) &&
    realpathSync(selectedConfig) === realpathSync(privateOcrConfig)) {
  throw new Error(
    "Issue429 private OCR must use its dedicated prelease-gated Vitest config directly.",
  );
}
// Wildcards and repeated project selectors can include the P23-owned race
// project even if its exact name is absent. An exact list of known other API
// projects is the only safe bypass. Never acquire/recover the parent's lease
// before attesting an ambiguous selection.
const explicitOtherProjects = new Set([
  "api-postgres-standard",
  "api-postgres-compound",
  "api-postgres-issue215",
  "api-postgres-issue309-browser",
  "api-postgres-issue319-private",
  "api-postgres-issue333-private",
  "api-postgres-issue333-w4-private",
]);
if (!projects.every((project) => explicitOtherProjects.has(project))) {
  await preflightIssue414Phase23HttpBeforeLease();
}

const lease = await acquireInvocationLease(
  `postgres-projects-${projects.join("-")}`,
  { selectedProjects: projects },
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
