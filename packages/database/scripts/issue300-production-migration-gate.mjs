// #300 migrations 94-96 are deliberately source-integrated but NOT approved
// to execute against production. Generic migrate:deploy must fail closed;
// a later separately reviewed rollout can remove this restriction.
import process from "node:process";
import { URL } from "node:url";

export function assertIssue300ProductionMigrationsDeferred(
  environment = process.env,
) {
  // Fail closed on unknown/staging/custom environments too; an accidentally
  // unset NODE_ENV cannot turn the merged 94–96 migrations into an allowed
  // production deploy. Only explicit local development/test may proceed.
  if (environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new Error("ISSUE300_PRODUCTION_MIGRATION_ROLLOUT_NOT_APPROVED");
  }
  // An operator must not claim a remote production DB is a local test by
  // setting NODE_ENV=test. This is a bounded URI guard, not proof of ownership
  // for a local listener; isolated database identity remains a separate test.
  let target;
  try {
    target = new URL(environment.MIGRATION_DATABASE_URL ?? "");
  } catch {
    throw new Error("ISSUE300_MIGRATION_LOCAL_TARGET_REQUIRED");
  }
  if (
    !["postgresql:", "postgres:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
  ) {
    throw new Error("ISSUE300_MIGRATION_LOCAL_TARGET_REQUIRED");
  }
}
