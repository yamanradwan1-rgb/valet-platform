import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertPinnedMigrationBytes } from "./race-migration-pins.mjs";

const migrationName = "20261113016000_issue416_a01_original_challenge_lineage";
const bytes = readFileSync(
  new URL(
    `../prisma/migrations/${migrationName}/migration.sql`,
    import.meta.url,
  ),
);
const lf = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"));

test("pinned SQL accepts its exact all-LF and all-CRLF Git checkout bytes", () => {
  assert.equal(assertPinnedMigrationBytes(migrationName, lf), true);
  assert.equal(assertPinnedMigrationBytes(migrationName, crlf), true);
});

test("pinned SQL rejects mixed newline representations and a lone CR", () => {
  const mixed = Buffer.from(crlf.toString("utf8").replace("\r\n", "\n"));
  const loneCr = Buffer.from(crlf.toString("utf8").replace("\r\n", "\r"));
  for (const candidate of [mixed, loneCr]) {
    assert.throws(
      () => assertPinnedMigrationBytes(migrationName, candidate),
      /ISSUE416_RACE_SOURCE_MIGRATION_CHECKSUM_CHANGED/,
    );
  }
});

test("pinned SQL rejects modified content in both newline representations", () => {
  for (const candidate of [lf, crlf]) {
    assert.throws(
      () =>
        assertPinnedMigrationBytes(
          migrationName,
          Buffer.concat([candidate, Buffer.from("-- unauthorized change\n")]),
        ),
      /ISSUE416_RACE_SOURCE_MIGRATION_CHECKSUM_CHANGED/,
    );
  }
});
