import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyManagementWriterMutationInventory } from "./management-writer-mutation-inventory.mjs";

function catalog({ illegalColumn = false, illegalSequence = false } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, args) {
      assert.deepEqual(args, ["vaylet_management_writer"]);
      queries.push(sql);
      const forbidden = sql.includes("has_sequence_privilege")
        ? illegalSequence
        : illegalColumn;
      return {
        rowCount: forbidden ? 1 : 0,
        rows: forbidden
          ? [{ relation_name: "organizations", column_name: "name" }]
          : [],
      };
    },
  };
}

test("Management writer verifies all current/future public DML columns and sequences", async () => {
  const allowed = catalog();
  await verifyManagementWriterMutationInventory(
    allowed,
    "vaylet_management_writer",
  );
  assert.equal(allowed.queries.length, 2);
  assert.match(allowed.queries[0], /has_column_privilege/);
  assert.match(allowed.queries[0], /namespace\.nspname='public'/);
  assert.match(allowed.queries[0], /relation\.relkind IN/);
  assert.doesNotMatch(allowed.queries[0], /WHERE relation\.relname=ANY/);
  assert.match(
    allowed.queries[0],
    /attribute\.attname='last_admin_activity_at'/,
  );
  assert.match(allowed.queries[0], /has_table_privilege/);
  assert.match(allowed.queries[1], /has_sequence_privilege/);
  await assert.rejects(
    verifyManagementWriterMutationInventory(
      catalog({ illegalColumn: true }),
      "vaylet_management_writer",
    ),
    /unexpected table or column mutation authority/,
  );
  await assert.rejects(
    verifyManagementWriterMutationInventory(
      catalog({ illegalSequence: true }),
      "vaylet_management_writer",
    ),
    /unexpected public sequence authority/,
  );
});
