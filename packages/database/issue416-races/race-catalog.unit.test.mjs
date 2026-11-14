import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

import {
  PG17_RUNTIME_SQL,
  PG17_MIGRATION_LEDGER_SQL,
  PG17_ADMISSION_ACL_SQL,
  PG17_PRIVATE_DEFAULT_ACL_SQL,
  REQUIRED_MIGRATIONS,
  validateMigrationLedger,
  validateAdmissionAclRows,
} from "./race-catalog-contract.mjs";
import { assertRaceRuntimeAuthorized } from "./race-readiness.mjs";

test("migration list matches reviewed source directories, never performs DDL", () => {
  const dir = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
  const current = readdirSync(dir).filter((item) =>
    /^202611130\d+_issue416_/.test(item),
  );
  assert.deepEqual([...REQUIRED_MIGRATIONS].sort(), current.sort());
  assert.match(PG17_MIGRATION_LEDGER_SQL, /_prisma_migrations/);
  for (const sql of [
    PG17_RUNTIME_SQL,
    PG17_MIGRATION_LEDGER_SQL,
    PG17_ADMISSION_ACL_SQL,
    PG17_PRIVATE_DEFAULT_ACL_SQL,
  ]) {
    assert.match(sql, /\bSELECT\b/i);
    assert.doesNotMatch(
      sql,
      /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+(?:TABLE|ROLE|SCHEMA|FUNCTION|INTO|public\.)/i,
    );
  }
});

test("all migrations must have actual committed rows and no unresolved attempt", () => {
  const rows = REQUIRED_MIGRATIONS.map((migration_name) => ({
    migration_name,
    finished_at: "a DB timestamp",
    rolled_back_at: null,
    applied_steps_count: 1,
    checksum: "a".repeat(64),
  }));
  assert.equal(validateMigrationLedger(rows), "SOURCE_LEDGER_SHAPE_ONLY");
  assert.throws(
    () =>
      validateMigrationLedger([
        ...rows,
        {
          migration_name: "historical-113",
          finished_at: null,
          rolled_back_at: null,
        },
      ]),
    /UNRESOLVED/,
  );
  assert.throws(() => validateMigrationLedger(rows.slice(1)), /NOT_COMMITTED/);
  assert.throws(assertRaceRuntimeAuthorized, /BLOCKED/);
});

test("admission ACL denies runtime, PUBLIC and inherited mutation/grant", () => {
  const admission = {
    private_schema: "auth_proof_private",
    admission_table: "authority_admissions",
    schema_owner: "vap1_proof_owner",
    table_owner: "vap1_proof_owner",
    runtime_schema_create: false,
    runtime_insert: false,
    runtime_update: false,
    runtime_delete: false,
    runtime_member_of_proof_owner: false,
    public_can_write: false,
  };
  const defaults = {
    default_owner: "vap1_proof_owner",
    default_schema: "auth_proof_private",
    object_kind: "f",
    public_execute: false,
  };
  assert.equal(
    validateAdmissionAclRows([admission], [defaults]),
    "SOURCE_ACL_SHAPE_ONLY",
  );
  assert.throws(
    () =>
      validateAdmissionAclRows(
        [
          {
            ...admission,
            runtime_update: true,
          },
        ],
        [defaults],
      ),
    /DENIED/,
  );
  assert.throws(() => validateAdmissionAclRows([admission], []), /MISSING/);
  assert.match(PG17_ADMISSION_ACL_SQL, /has_table_privilege/);
  assert.match(PG17_PRIVATE_DEFAULT_ACL_SQL, /pg_default_acl/);
});
