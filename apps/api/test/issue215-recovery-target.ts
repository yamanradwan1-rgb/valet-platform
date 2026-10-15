import {
  requireIssue215TestUrl,
  verifyIssue215Bootstrap,
} from "../../../packages/database/src/condition-photo-p1-test-target.mjs";

const protectedApiProject = "api-postgres-issue215";

/** Only the exact protected project may exercise recovery database lifecycle. */
export function recoveryDatabaseIsExplicitlyOwned(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (environment.VAYLET_TEST_PROJECT !== protectedApiProject) return false;
  // Keep the original local operator opt-in in addition to pinned project,
  // container, volume, role and PostgreSQL identity checks. The CI branch
  // has separate, explicitly attested GitHub Actions identity requirements.
  if (environment.VAYLET_ISSUE215_TEST_TARGET !== "ci" &&
      environment.ISSUE215_DISPOSABLE_PG_CONFIRMED !== "YES")
    throw new Error("Issue 215 recovery requires explicit disposable PostgreSQL opt-in.");
  requireIssue215TestUrl(environment);
  return true;
}

export { requireIssue215TestUrl, verifyIssue215Bootstrap };
