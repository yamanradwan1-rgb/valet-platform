import assert from "node:assert/strict";
import { test } from "node:test";
import { assertIssue300ProductionMigrationsDeferred }
  from "./issue300-production-migration-gate.mjs";

test("production, unset and staging migrations refuse until separate rollout", () => {
  for (const NODE_ENV of ["production", "staging", "preview", "", undefined]) {
    assert.throws(
      () => assertIssue300ProductionMigrationsDeferred({ NODE_ENV }),
      /ISSUE300_PRODUCTION_MIGRATION_ROLLOUT_NOT_APPROVED/,
    );
  }
});

test("isolated ordinary local migration testing is not forbidden", () => {
  for (const NODE_ENV of ["development", "test"]) {
    assert.doesNotThrow(() =>
      assertIssue300ProductionMigrationsDeferred({
        NODE_ENV,
        MIGRATION_DATABASE_URL: "postgresql://test:test@localhost:58387/issue300_test",
      }));
  }
});

test("forged development/test env never enables a remote database migration", () => {
  for (const NODE_ENV of ["test", "development"]) {
    for (const MIGRATION_DATABASE_URL of [
      undefined,
      "postgresql://migration:private@database.internal:5432/valet",
      "postgresql://migration:private@10.10.10.10:5432/valet",
      "invalid",
    ]) {
      assert.throws(() => assertIssue300ProductionMigrationsDeferred({
        NODE_ENV, MIGRATION_DATABASE_URL,
      }), /ISSUE300_MIGRATION_LOCAL_TARGET_REQUIRED/);
    }
  }
});
