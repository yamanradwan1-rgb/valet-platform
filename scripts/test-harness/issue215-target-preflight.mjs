import { createRequire } from "node:module";

import { preflightIssue215TestTarget } from "../../packages/database/src/condition-photo-p1-test-target.mjs";

export function requiresIssue215Preflight(label, argv = process.argv) {
  if (label === "root-tests") return !argv.includes("--non-postgres-only");
  if (label === "database-package-tests" || label.startsWith("postgres-projects-database-"))
    return true;
  if (label === "focused-database") return argv.some((arg) => arg.includes("condition-photo-"));
  // Global Vitest project includes Issue215 test files by construction.
  // Never infer exclusions/selection from argv: Vitest supports --exclude,
  // --outputFile, --changed and other flags whose arguments resemble files.
  return label === "database-postgres-direct" || label === "database-postgres-provision";
}

export async function preflightIssue215BeforeHarnessCleanup(label, argv = process.argv) {
  if (!requiresIssue215Preflight(label, argv)) return;
  const requireFromDatabase = createRequire(new URL("../../packages/database/package.json", import.meta.url));
  const pg = requireFromDatabase("pg");
  await preflightIssue215TestTarget(pg.Client, "database-postgres-provision");
}
