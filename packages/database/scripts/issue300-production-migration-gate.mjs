// #300 migrations 94-96 are deliberately source-integrated but NOT approved
// to execute against production. Generic migrate:deploy must fail closed;
// a later separately reviewed rollout can remove this restriction.
import process from "node:process";

export function assertIssue300ProductionMigrationsDeferred(
  environment = process.env,
) {
  // Fail closed on unknown/staging/custom environments too; an accidentally
  // unset NODE_ENV cannot turn the merged 94–96 migrations into an allowed
  // production deploy. Only explicit local development/test may proceed.
  if (environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new Error("ISSUE300_PRODUCTION_MIGRATION_ROLLOUT_NOT_APPROVED");
  }
}
