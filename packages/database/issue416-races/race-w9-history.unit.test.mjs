import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PINNED_MIGRATION_SHA256,
  PG17_MIGRATION_LEDGER_SQL,
  validateMigrationLedger,
  verifyPinnedMigrationSources,
} from "./race-catalog-contract.mjs";
import {
  W9_113_FIRST_ROLLBACK,
  W9_113_SECOND_UNFINISHED,
} from "./race-w9-migration-history.mjs";
import { assertRaceRuntimeAuthorized } from "./race-readiness.mjs";

const currentRows = () =>
  verifyPinnedMigrationSources().map((migration_name) => ({
    id: `synthetic-success-${migration_name}`,
    migration_name,
    checksum: PINNED_MIGRATION_SHA256[migration_name],
    started_at: "synthetic-started",
    finished_at: "synthetic-finished",
    rolled_back_at: null,
    applied_steps_count: 1,
  }));

const historicFirst = () => ({
  ...W9_113_FIRST_ROLLBACK,
  started_at: "2026-11-13T20:50:14.506337Z",
  finished_at: null,
  rolled_back_at: "2026-11-13T21:09:34.483501Z",
  applied_steps_count: 0,
});

const historicSecond = () => ({
  ...W9_113_SECOND_UNFINISHED,
  started_at: "2026-11-13T21:09:49.969868Z",
  finished_at: null,
  rolled_back_at: null,
  applied_steps_count: 0,
});

test("Prisma ledger query includes row UUID to distinguish W9 migration113 attempts", () => {
  assert.match(
    PG17_MIGRATION_LEDGER_SQL,
    /SELECT id, migration_name, checksum/,
  );
  assert.equal(
    W9_113_FIRST_ROLLBACK.checksum,
    "d938b237b846b7429bcaae980b6c1519a941852bdd57e719aa1ab3682fafddc9",
  );
  assert.equal(
    W9_113_SECOND_UNFINISHED.checksum,
    "746ce2403987eaadddebb816adea24c92b4ba9720a8da4ed007b890e0a1f8d36",
  );
});

test("exact historic W9 first 113 rolled-back row coexists with reviewed successful rows", () => {
  const rows = currentRows();
  assert.equal(rows.length === 14 || rows.length === 19, true);
  assert.equal(
    validateMigrationLedger([rows[0], historicFirst(), ...rows.slice(1)]),
    "SOURCE_LEDGER_SHAPE_ONLY",
  );
  // It does not substitute for a committed current 113 row.
  assert.throws(
    () =>
      validateMigrationLedger([
        historicFirst(),
        ...rows.filter(
          (r) => r.migration_name !== historicFirst().migration_name,
        ),
      ]),
    /REQUIRED_MIGRATION_NOT_COMMITTED/,
  );
});

test("W9 exact second unfinished 113 is DENIED despite valid historic first rollback", () => {
  const rows = currentRows();
  assert.throws(
    () => validateMigrationLedger([...rows, historicFirst(), historicSecond()]),
    /W9_SECOND_113_UNFINISHED_DENIED/,
  );
  assert.throws(
    () => validateMigrationLedger([...rows, historicSecond()]),
    /W9_SECOND_113_UNFINISHED_DENIED/,
  );
  assert.throws(assertRaceRuntimeAuthorized, /BLOCKED_PG17_NOT_RUN/);
});

test("wrong UUID, historic checksum, duplicate, foreign rollback and unreviewed attempts fail closed", () => {
  const rows = currentRows();
  for (const mutation of [
    { ...historicFirst(), id: "11111111-1111-4111-8111-111111111111" },
    {
      ...historicFirst(),
      checksum: PINNED_MIGRATION_SHA256[historicFirst().migration_name],
    },
    { ...historicFirst(), applied_steps_count: 1 },
    { ...historicFirst(), finished_at: "synthetic-finished" },
    { ...historicFirst(), rolled_back_at: null },
    {
      ...historicFirst(),
      migration_name: "20261113011400_issue416_vap1_private_codec",
    },
    { ...historicFirst(), migration_name: "20261113013500_issue416_unknown" },
    {
      id: "foreign",
      migration_name: "ordinary_other",
      finished_at: null,
      rolled_back_at: "rollback",
      applied_steps_count: 0,
    },
    {
      id: "foreign",
      migration_name: "ordinary_other",
      finished_at: null,
      rolled_back_at: null,
      applied_steps_count: 0,
    },
  ]) {
    assert.throws(
      () => validateMigrationLedger([...rows, mutation]),
      /ISSUE416_RACE_MIGRATION_LEDGER_UNRESOLVED/,
    );
  }
  assert.throws(
    () => validateMigrationLedger([...rows, historicFirst(), historicFirst()]),
    /W9_FIRST_ROLLBACK_DUPLICATE/,
  );
});
