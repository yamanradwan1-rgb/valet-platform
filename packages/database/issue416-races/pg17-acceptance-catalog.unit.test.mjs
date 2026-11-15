import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

import {
  assertCommittedExactLedger,
  migrationSourceChecksums,
} from "./pg17-acceptance-catalog.mjs";
import { executeAcceptanceCli } from "./pg17-acceptance-cli.mjs";
import { canonicalMigrationLf } from "./pg17-acceptance-migration-source.mjs";
import {
  REQUIRED_MIGRATIONS,
  assertReviewedMigrationSet,
} from "./race-migration-pins.mjs";

const fixtureRows = (source = migrationSourceChecksums()) =>
  [...source].map(([migration_name, hashes]) => ({
    migration_name,
    checksum: [...hashes][0],
    finished_at: new Date(),
    started_at: new Date(),
    rolled_back_at: null,
    applied_steps_count: 1,
  }));

test("29 immutable Issue416 sources and 3 separate Option C names keep an exact ledger", () => {
  const source = migrationSourceChecksums();
  const issue416 = [...source.keys()].filter((name) =>
    name.includes("issue416"),
  );
  const optionC = [
    "20261115016200_issue416_s04_signed_quota_guard",
    "20261115020100_issue416_optionc_s01_revocation_monotonic",
    "20261115220000_issue416_s02_bound_admin_activity",
  ];
  assert.equal(REQUIRED_MIGRATIONS.length, 29);
  assert.equal(issue416.length, REQUIRED_MIGRATIONS.length + optionC.length);
  assert.deepEqual([...issue416].sort(), [...REQUIRED_MIGRATIONS, ...optionC].sort());
  assert.deepEqual(
    [...assertReviewedMigrationSet(issue416.filter((name) =>
      REQUIRED_MIGRATIONS.includes(name)))],
    [...REQUIRED_MIGRATIONS].sort(),
  );
  assert.equal(assertCommittedExactLedger(fixtureRows()), source.size);

  for (const mutation of [
    (rows) => rows.pop(),
    (rows) => rows.push({ ...rows[0] }),
    (rows) => {
      rows[0].finished_at = null;
    },
    (rows) => {
      rows[0].rolled_back_at = new Date();
    },
    (rows) => {
      rows[0].checksum = "tampered";
    },
    (rows) => {
      rows[0].migration_name = "20261113011400_issue416_other";
    },
    (rows) => {
      rows[0].applied_steps_count = 0;
    },
  ]) {
    const rows = fixtureRows();
    mutation(rows);
    assert.throws(() => assertCommittedExactLedger(rows), /W30_PG17_/);
  }

  const incompleteSource = new Map(source);
  incompleteSource.delete(REQUIRED_MIGRATIONS[0]);
  assert.throws(
    () =>
      assertCommittedExactLedger(
        fixtureRows(incompleteSource),
        incompleteSource,
      ),
    /W30_PG17_MIGRATION_HISTORY_INCOMPLETE/,
  );
  const forgedSource = new Map(source);
  const [forgedName] = forgedSource.keys();
  forgedSource.set(forgedName, new Set(["caller-forged-checksum"]));
  const forgedRows = fixtureRows();
  forgedRows.find((row) => row.migration_name === forgedName).checksum =
    "caller-forged-checksum";
  assert.throws(
    () => assertCommittedExactLedger(forgedRows, forgedSource),
    /W30_PG17_MIGRATION_HISTORY_UNTRUSTED/,
  );
});

test("non-pinned source normalization rejects lone CR and mixed line endings", () => {
  const lf = Buffer.from("SELECT 1;\n", "utf8");
  const crlf = Buffer.from("SELECT 1;\r\n", "utf8");
  assert.deepEqual(canonicalMigrationLf(lf), lf);
  assert.deepEqual(canonicalMigrationLf(crlf), lf);
  assert.throws(
    () => canonicalMigrationLf(Buffer.from("SELECT 1;\r", "utf8")),
    /W30_PG17_MIGRATION_LINE_ENDINGS_UNTRUSTED/,
  );
  assert.throws(
    () => canonicalMigrationLf(Buffer.from("SELECT 1;\r\nSELECT 2;\n", "utf8")),
    /W30_PG17_MIGRATION_LINE_ENDINGS_UNTRUSTED/,
  );
});

test("only exact LF and CRLF variants of pinned/committed migration bytes are accepted", () => {
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const source = migrationSourceChecksums();
  for (const [name, approved] of source) {
    const original = readFileSync(
      new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
    );
    const lf = Buffer.from(original.toString("utf8").replace(/\r\n/g, "\n"));
    const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"));
    assert.deepEqual(approved, new Set([digest(lf), digest(crlf)]), name);
    for (const checksum of [digest(lf), digest(crlf)]) {
      const rows = fixtureRows(source);
      rows.find((row) => row.migration_name === name).checksum = checksum;
      assert.equal(assertCommittedExactLedger(rows), rows.length);
    }
    const rows = fixtureRows(source);
    rows.find((row) => row.migration_name === name).checksum = digest(
      Buffer.concat([lf, Buffer.from("-- unexpected modification\n")]),
    );
    assert.throws(() => assertCommittedExactLedger(rows), /UNTRUSTED/);
  }
});

test("CLI status exposes zero execution and rejects unbound domain acceptance", async () => {
  assert.match(
    await executeAcceptanceCli(["--status"]),
    /0 PG17 domain cases executed/,
  );
  assert.match(
    await executeAcceptanceCli(["--source-check"]),
    /0 domain executed/,
  );
  await assert.rejects(
    executeAcceptanceCli(["--execute"]),
    /DOMAIN_EXECUTION_NOT_BOUND/,
  );
  await assert.rejects(
    executeAcceptanceCli(["--smoke", "--execute"]),
    /UNKNOWN_MODE/,
  );
});
