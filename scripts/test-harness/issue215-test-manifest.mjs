// Exact reviewed database test ownership. These may CREATE/DROP databases or
// roles through the Issue #215 task-only fixture, directly or transitively.
// Keep this list explicit: filename globs and arbitrary CLI flags are not
// authoritative test selection.
export const ISSUE215_PROJECT = "database-postgres-issue215";
export const ISSUE215_API_PROJECT = "api-postgres-issue215";
export const issue215ApiPostgresFiles = Object.freeze([
  "issue215-policy-recovery.test.ts",
  "issue215-real-http-integration.test.ts",
  "issue215-recovery-real-s3.integration.test.ts",
  "issue215-recovery.integration.test.ts",
  "issue215-staff-credential-races.test.ts",
]);
export const issue215PostgresFiles = Object.freeze([
  "condition-photo-p1-audit-availability.integration.test.ts",
  "condition-photo-p1-integrity.integration.test.ts",
  "condition-photo-p1-negative.integration.test.ts",
  "condition-photo-p1-owned-target.test.ts",
  "condition-photo-p1-stored.integration.test.ts",
  "condition-photo-p1-upgrade.integration.test.ts",
  "condition-photo-p2-anti-abuse.integration.test.ts",
  "condition-photo-runtime-privileges.integration.test.ts",
]);

export function isIssue215PostgresFile(file) {
  return issue215PostgresFiles.includes(file);
}

export function isIssue215ApiPostgresFile(file) {
  return issue215ApiPostgresFiles.includes(file);
}

export function isIssue215ProtectedProject(projectName) {
  return projectName === ISSUE215_PROJECT || projectName === ISSUE215_API_PROJECT;
}
