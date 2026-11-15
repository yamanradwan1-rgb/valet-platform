import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRIVATE_TRIGGER_SQL,
  REQUIRED_PRIVATE_TRIGGERS,
  assertPrivateTriggers,
} from "./pg17-acceptance-trigger-manifest.mjs";

const safeRows = () =>
  REQUIRED_PRIVATE_TRIGGERS.map(([trigger_name, table_name, fn]) => ({
    trigger_name,
    table_name,
    schema_name: "auth_proof_private",
    handler: `auth_proof_private.${fn}`,
    enabled: "O",
    is_internal: false,
    handler_args: 0,
    handler_kind: "f",
  }));

test("all 32 pinned private trigger names, parent tables and handlers are required", () => {
  assert.equal(REQUIRED_PRIVATE_TRIGGERS.length, 32);
  assert.equal(assertPrivateTriggers(safeRows()), true);
  assert.match(PRIVATE_TRIGGER_SQL, /pg_trigger/);
  assert.match(PRIVATE_TRIGGER_SQL, /NOT t\.tgisinternal/);
  for (const rows of [
    safeRows().slice(1),
    [...safeRows(), { ...safeRows()[0], trigger_name: "foreign_guard" }],
    safeRows().map((r, i) =>
      i === 0 ? { ...r, trigger_name: safeRows()[1].trigger_name } : r,
    ),
  ]) {
    assert.throws(
      () => assertPrivateTriggers(rows),
      /TRIGGER_MANIFEST_UNPROVEN/,
    );
  }
});

test("key mutation or quota denial triggers cannot be dropped, disabled or diverted", () => {
  for (const key of [
    "vap1_keys_immutable_update",
    "vap1_receipt_immutable",
    "issue416_r03_10_client_count",
    "issue416_r03_client_immutable",
  ]) {
    const original = safeRows().find((r) => r.trigger_name === key);
    assert.ok(original, key);
    for (const mutation of [
      { handler: "auth_proof_private.noop" },
      { handler_args: 1 },
      { handler_kind: "p" },
      { enabled: "D" },
      { enabled: "R" },
      { is_internal: true },
      { table_name: "proof_keys" },
      { schema_name: "public" },
    ]) {
      const rows = safeRows().map((row) =>
        row.trigger_name === key ? { ...row, ...mutation } : row,
      );
      if (
        Object.keys(mutation)[0] === "table_name" &&
        original.table_name === "proof_keys"
      ) {
        rows.find((row) => row.trigger_name === key).table_name =
          "reset_issue_quota_entries";
      }
      assert.throws(
        () => assertPrivateTriggers(rows),
        /TRIGGER_MANIFEST_UNPROVEN/,
        key,
      );
    }
  }
});
