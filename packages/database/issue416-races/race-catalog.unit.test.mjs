import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

import {
  PG17_RUNTIME_SQL,
  PG17_MIGRATION_LEDGER_SQL,
  PG17_ADMISSION_ACL_SQL,
  PG17_PRIVATE_DEFAULT_ACL_SQL,
  PG17_PRIVATE_FUNCTION_ACL_SQL,
  PINNED_MIGRATION_SHA256,
  REQUIRED_MIGRATIONS,
  validateMigrationLedger,
  validateAdmissionAclRows,
  validatePrivateFunctionAclRows,
  verifyPinnedMigrationSources,
} from "./race-catalog-contract.mjs";
import { assertRaceRuntimeAuthorized } from "./race-readiness.mjs";
import {
  ORIGINAL_SOURCE_MIGRATIONS,
  assertPinnedMigrationBytes,
  assertReviewedMigrationSet,
} from "./race-migration-pins.mjs";

test("LF canonical Git blob and CRLF checkout accept only identical SQL bytes", () => {
  const name = "20261113013500_issue416_r03_public_legacy_scope_deny";
  const checkedOut = readFileSync(
    new URL("../prisma/migrations/" + name + "/migration.sql", import.meta.url),
  );
  const lf = Buffer.from(checkedOut.toString("utf8").replace(/\r\n/g, "\n"));
  const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"));
  assert.equal(assertPinnedMigrationBytes(name, lf), true);
  assert.equal(assertPinnedMigrationBytes(name, crlf), true);
  const mixed = Buffer.from(crlf.toString("utf8").replace("\r\n", "\n"));
  assert.throws(() => assertPinnedMigrationBytes(name, mixed), /CHECKSUM_CHANGED/);
  const loneCr = Buffer.concat([lf, Buffer.from([13])]);
  assert.throws(() => assertPinnedMigrationBytes(name, loneCr), /CHECKSUM_CHANGED/);
  const changed = Buffer.from(lf.toString("utf8").replace("scope", "scoPe"));
  assert.throws(() => assertPinnedMigrationBytes(name, changed), /CHECKSUM_CHANGED/);
});
test("migration list matches reviewed source directories, never performs DDL", () => {
  const dir = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
  const current = readdirSync(dir).filter((item) =>
    /^\d{14}_issue416_/.test(item),
  );
  const reviewed = verifyPinnedMigrationSources();
  assert.deepEqual([...reviewed], current.sort());
  assert.ok([14, 19].includes(reviewed.length));
  assert.equal(Object.keys(PINNED_MIGRATION_SHA256).length, 19);
  assert.equal(REQUIRED_MIGRATIONS.length, 19);
  assert.equal(ORIGINAL_SOURCE_MIGRATIONS.length, 14);
  assert.equal(
    PINNED_MIGRATION_SHA256["20261113013500_issue416_r03_public_legacy_scope_deny"],
    "7ff71645e45667584f625d6846fe8e6978fadd9888b7d31d196a1be35ab5d7f8",
  );
  assert.deepEqual(
    [...assertReviewedMigrationSet(ORIGINAL_SOURCE_MIGRATIONS)],
    [...ORIGINAL_SOURCE_MIGRATIONS].sort(),
  );
  assert.deepEqual(
    [...assertReviewedMigrationSet(REQUIRED_MIGRATIONS)],
    [...REQUIRED_MIGRATIONS].sort(),
  );
  for (const extra of [1, 2, 3, 4]) {
    assert.throws(
      () =>
        assertReviewedMigrationSet([
          ...ORIGINAL_SOURCE_MIGRATIONS,
          ...REQUIRED_MIGRATIONS.slice(14, 14 + extra),
        ]),
      /SOURCE_MIGRATION_SET_CHANGED/,
    );
  }
  assert.throws(
    () =>
      assertReviewedMigrationSet([
        ...REQUIRED_MIGRATIONS,
        "20261113013500_issue416_unknown",
      ]),
    /SOURCE_MIGRATION_SET_CHANGED/,
  );
  assert.throws(
    () => assertPinnedMigrationBytes(REQUIRED_MIGRATIONS[0], "tampered SQL"),
    /SOURCE_MIGRATION_CHECKSUM_CHANGED/,
  );
  assert.throws(
    () => assertPinnedMigrationBytes("20261114013100_issue416_unreviewed", ""),
    /SOURCE_MIGRATION_NOT_REVIEWED/,
  );
  assert.match(PG17_MIGRATION_LEDGER_SQL, /_prisma_migrations/);
  for (const sql of [
    PG17_RUNTIME_SQL,
    PG17_MIGRATION_LEDGER_SQL,
    PG17_ADMISSION_ACL_SQL,
    PG17_PRIVATE_DEFAULT_ACL_SQL,
    PG17_PRIVATE_FUNCTION_ACL_SQL,
  ]) {
    assert.match(sql, /\bSELECT\b/i);
    assert.doesNotMatch(
      sql,
      /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+(?:TABLE|ROLE|SCHEMA|FUNCTION|INTO|public\.)/i,
    );
  }
});

test("reviewed source migrations require pinned committed ledger rows", () => {
  const rows = verifyPinnedMigrationSources().map((migration_name) => ({
    migration_name,
    finished_at: "a DB timestamp",
    rolled_back_at: null,
    applied_steps_count: 1,
    checksum: PINNED_MIGRATION_SHA256[migration_name],
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
  assert.throws(
    () =>
      validateMigrationLedger([
        ...rows
          .slice(0, 1)
          .map((row) => ({ ...row, checksum: "a".repeat(64) })),
        ...rows.slice(1),
      ]),
    /LEDGER_MIGRATION_CHECKSUM_MISMATCH/,
  );
  assert.throws(
    () =>
      validateMigrationLedger([
        ...rows,
        {
          migration_name: "20261114013100_issue416_unreviewed_change",
          finished_at: "a DB timestamp",
          rolled_back_at: null,
          applied_steps_count: 1,
          checksum: "a".repeat(64),
        },
      ]),
    /CHECKSUM_MISMATCH/,
  );
  assert.throws(assertRaceRuntimeAuthorized, /BLOCKED/);
});

test("Prisma ledger accepts exact Linux LF blobs but never changed SQL", () => {
  const rows = REQUIRED_MIGRATIONS.map((migration_name) => {
    const original = readFileSync(
      new URL("../prisma/migrations/" + migration_name + "/migration.sql", import.meta.url),
    );
    const linux = Buffer.from(original.toString("utf8").replace(/\r\n/g, "\n"));
    return {
      migration_name,
      finished_at: "synthetic-finished",
      rolled_back_at: null,
      applied_steps_count: 1,
      checksum: createHash("sha256").update(linux).digest("hex"),
    };
  });
  assert.equal(validateMigrationLedger(rows), "SOURCE_LEDGER_SHAPE_ONLY");
  assert.throws(
    () => validateMigrationLedger(rows.map((row, i) => i === 0
      ? { ...row, checksum: "f".repeat(64) } : row)),
    /LEDGER_MIGRATION_CHECKSUM_MISMATCH/,
  );
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
    runtime_can_insert_column: false,
    runtime_can_update_column: false,
    runtime_delete: false,
    runtime_truncate: false,
    runtime_member_of_proof_owner: false,
    public_can_write: false,
    public_can_write_column: false,
  };
  const defaults = {
    default_owner: "vap1_proof_owner",
    default_schema: "auth_proof_private",
    object_kind: "f",
    global_public_execute: false,
    schema_public_execute: false,
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
  for (const property of [
    "runtime_can_insert_column",
    "runtime_can_update_column",
    "public_can_write_column",
    "runtime_truncate",
  ]) {
    assert.throws(
      () =>
        validateAdmissionAclRows(
          [{ ...admission, [property]: true }],
          [defaults],
        ),
      /DENIED/,
    );
  }
  for (const property of ["global_public_execute", "schema_public_execute"]) {
    assert.throws(
      () =>
        validateAdmissionAclRows(
          [admission],
          [{ ...defaults, [property]: true }],
        ),
      /DENIED/,
    );
  }
  assert.match(PG17_ADMISSION_ACL_SQL, /has_table_privilege/);
  assert.match(PG17_ADMISSION_ACL_SQL, /has_any_column_privilege/);
  assert.match(PG17_ADMISSION_ACL_SQL, /pg_attribute/);
  assert.match(PG17_PRIVATE_DEFAULT_ACL_SQL, /pg_default_acl/);
  assert.match(PG17_PRIVATE_DEFAULT_ACL_SQL, /acldefault\('f'/);
});

test("private function ACL query enumerates actual pg_proc overloads and blocks PUBLIC/role grants", () => {
  assert.match(PG17_PRIVATE_FUNCTION_ACL_SQL, /pg_proc/);
  assert.match(PG17_PRIVATE_FUNCTION_ACL_SQL, /has_function_privilege/);
  assert.match(PG17_PRIVATE_FUNCTION_ACL_SQL, /aclexplode/);
  assert.match(PG17_PRIVATE_FUNCTION_ACL_SQL, /pg_has_role/);
  const row = {
    signature: "auth_proof_private.vap1_verify(uuid)",
    function_owner: "vap1_proof_owner",
    runtime_can_execute: false,
    runtime_member_of_function_owner: false,
    public_can_execute: false,
  };
  assert.equal(
    validatePrivateFunctionAclRows([row]),
    "SOURCE_FUNCTION_ACL_SHAPE_ONLY",
  );
  assert.throws(() => validatePrivateFunctionAclRows([]), /MISSING/);
  assert.throws(() => validatePrivateFunctionAclRows([row, row]), /DENIED/);
  for (const property of [
    "runtime_can_execute",
    "runtime_member_of_function_owner",
    "public_can_execute",
  ]) {
    assert.throws(
      () => validatePrivateFunctionAclRows([{ ...row, [property]: true }]),
      /DENIED/,
    );
  }
});
