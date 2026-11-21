import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONSTRAINT_FIELDS,
  INDEX_FIELDS,
  PRIVATE_CONSTRAINT_SQL,
  PRIVATE_INDEX_SQL,
  REQUIRED_OBJECT_PINS,
  TRIGGER_FIELDS,
  assertPinnedObjectCatalog,
  objectCatalogDigest,
} from "./pg17-acceptance-object-manifest.mjs";

const record = (fields) =>
  Object.fromEntries(fields.map((field) => [field, null]));

test("frozen PG17 index/constraint/trigger catalog count and SHA256 pins", () => {
  assert.deepEqual(
    [
      REQUIRED_OBJECT_PINS.indexes.count,
      REQUIRED_OBJECT_PINS.constraints.count,
      REQUIRED_OBJECT_PINS.triggers.count,
    ],
    [50, 142, 32],
  );
  for (const kind of ["indexes", "constraints", "triggers"]) {
    assert.match(REQUIRED_OBJECT_PINS[kind].digest, /^[0-9a-f]{64}$/);
  }
  assert.match(PRIVATE_INDEX_SQL, /pg_get_indexdef/);
  assert.match(PRIVATE_INDEX_SQL, /x\.indisunique/);
  assert.match(PRIVATE_INDEX_SQL, /x\.indisvalid/);
  assert.match(PRIVATE_CONSTRAINT_SQL, /pg_get_constraintdef/);
  assert.match(PRIVATE_CONSTRAINT_SQL, /c\.convalidated/);
  assert.throws(
    () => assertPinnedObjectCatalog([], [], []),
    /INDEXES_MANIFEST_UNPROVEN/,
  );
});

test("index predicate/uniqueness or constraint/trigger definition tampering changes digest", () => {
  for (const [fields, key, newValue] of [
    [INDEX_FIELDS, "indisunique", true],
    [INDEX_FIELDS, "indisvalid", false],
    [INDEX_FIELDS, "index_definition", "CREATE INDEX replaced"],
    [INDEX_FIELDS, "predicate", "(state = 'ACTIVE')"],
    [CONSTRAINT_FIELDS, "constraint_definition", "CHECK (true)"],
    [CONSTRAINT_FIELDS, "convalidated", false],
    [TRIGGER_FIELDS, "trigger_definition", "CREATE TRIGGER no_op"],
    [TRIGGER_FIELDS, "tgtype", 1],
  ]) {
    const row = record(fields);
    const digest = objectCatalogDigest([row], fields);
    assert.notEqual(
      objectCatalogDigest([{ ...row, [key]: newValue }], fields),
      digest,
    );
  }
  assert.throws(
    () => objectCatalogDigest([{}], INDEX_FIELDS),
    /PRIVATE_OBJECT_FIELDS_INCOMPLETE/,
  );
});
