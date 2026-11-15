import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs, {
  appendFileSync,
} from "node:fs";
import {
  mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readTrustedMigrationBytes } from "./pg17-acceptance-source-fd.mjs";
import { approvedMigrationChecksums } from "./race-migration-pins.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNTRUSTED = /W30_PG17_MIGRATION_SOURCE_FILE_UNTRUSTED/;

test("migration SQL read validates bytes from its own regular-file descriptor", (t) => {
  const root = mkdtempSync(join(HERE, ".w36-fd-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "migration.sql");
  const expected = Buffer.from("CREATE TABLE synthetic (id integer);\n");
  writeFileSync(file, expected);
  assert.deepEqual(readTrustedMigrationBytes(file), expected);
  assert.throws(() => readTrustedMigrationBytes(join(root, "missing.sql")), UNTRUSTED);
});

test("migration SQL read refuses a directory and an oversized file", (t) => {
  const root = mkdtempSync(join(HERE, ".w36-fd-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, "dir");
  mkdirSync(directory);
  assert.throws(() => readTrustedMigrationBytes(directory), UNTRUSTED);
  const oversized = join(root, "large.sql");
  writeFileSync(oversized, "");
  truncateSync(oversized, 16 * 1024 * 1024 + 1);
  assert.throws(() => readTrustedMigrationBytes(oversized), UNTRUSTED);
});

test("migration SQL read rejects a symlink even if its target is a valid file", (t) => {
  const root = mkdtempSync(join(HERE, ".w36-fd-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const real = join(root, "real.sql");
  const link = join(root, "migration.sql");
  writeFileSync(real, "SELECT 1;\n");
  try {
    symlinkSync(real, link, "file");
  } catch (error) {
    if (error.code === "EPERM") {
      t.skip("host does not permit creating symlinks");
      return;
    }
    throw error;
  }
  assert.throws(() => readTrustedMigrationBytes(link), UNTRUSTED);
});

test("migration SQL read fails closed on post-fstat file growth", (t) => {
  const root = mkdtempSync(join(HERE, ".w36-fd-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "migration.sql");
  writeFileSync(file, "SELECT 1;");
  const originalRead = fs.readSync;
  let appended = false;
  fs.readSync = (...args) => {
    const count = originalRead(...args);
    if (count > 0 && !appended) {
      appended = true;
      appendFileSync(file, "X");
    }
    return count;
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => readTrustedMigrationBytes(file), UNTRUSTED);
    assert.equal(appended, true);
  } finally {
    fs.readSync = originalRead;
    syncBuiltinESMExports();
  }
});

test("migration checksum lookup rejects unreviewed traversal before touching disk", () => {
  assert.throws(
    () => approvedMigrationChecksums("../../../../outside-repository"),
    /ISSUE416_RACE_SOURCE_MIGRATION_NOT_REVIEWED/,
  );
});
