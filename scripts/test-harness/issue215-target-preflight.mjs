import { createRequire } from "node:module";

import { preflightIssue215TestTarget } from "../../packages/database/src/condition-photo-p1-test-target.mjs";
import { ISSUE215_API_PROJECT, ISSUE215_PROJECT, ISSUE309_BROWSER_PROJECT, isIssue215ProtectedProject } from "./issue215-test-manifest.mjs";

export function requiresIssue215Preflight(selectedProjects = []) {
  // Callers pass project ownership as resolved by the test manifest / runner,
  // not tokens from process.argv, filenames in --exclude or output-file flags.
  return selectedProjects.some(isIssue215ProtectedProject);
}

export function requiresIssue215StaleOwnerPreflight(staleOwner) {
  if (!staleOwner) return false;
  if (staleOwner.issue215RecoveryRequired === true) return true;
  if (Array.isArray(staleOwner.recoveryRunIds) &&
      staleOwner.recoveryRunIds.length > 0 &&
      staleOwner.issue215RecoveryRequired === undefined) return true;
  if (staleOwner.issue215Protected === true) return true;
  if (staleOwner.issue215Protected === false) return false;
  // Legacy leases predate the per-project ownership split. These old labels
  // could have executed task-only P1 even when no resource event was yet
  // persisted (e.g. a child was interrupted before its first CREATE).
  const name = staleOwner.projectName;
  return name === "root-tests" || name === "database-package-tests" ||
    name === "focused-database" || name === ISSUE215_PROJECT ||
    name === ISSUE215_API_PROJECT ||
    name === ISSUE309_BROWSER_PROJECT ||
    name === "database-postgres-direct" ||
    name === "database-postgres-provision" ||
    (typeof name === "string" && name.startsWith("postgres-projects-database-"));
}

export async function preflightIssue215BeforeHarnessCleanup(selectedProjects = []) {
  if (!requiresIssue215Preflight(selectedProjects)) return;
  const requireFromDatabase = createRequire(new URL("../../packages/database/package.json", import.meta.url));
  const pg = requireFromDatabase("pg");
  const projectName = selectedProjects.includes(ISSUE215_PROJECT)
    ? ISSUE215_PROJECT : ISSUE215_API_PROJECT;
  await preflightIssue215TestTarget(pg.Client, projectName);
}
