import assert from "node:assert/strict";
import { test } from "node:test";
import {
  staffSessionLockFunction,
  staffSessionLockOwner,
} from "./option-c-staff-session-lock-contract.mjs";
import { assertOwnerObjects } from "./option-c-staff-session-lock-verification.mjs";

const current = {
  kind: "function",
  schema: "public",
  name: "staff_auth_lock_current_session",
  exact_signature: true,
};

function client(rows) {
  return {
    async query(sql, params) {
      assert.match(sql, /function\.oid=pg_catalog\.to_regprocedure\(\$2\)/);
      assert.deepEqual(params, [
        staffSessionLockOwner,
        staffSessionLockFunction,
      ]);
      return { rowCount: rows.length, rows };
    },
  };
}

test("session lock owner inventory compares PG17 function OID rather than argument display containing parameter names", async () => {
  await assertOwnerObjects(client([current]));
  for (const bad of [
    [],
    [current, { ...current, name: "untrusted" }],
    [{ ...current, exact_signature: false }],
    [{ ...current, kind: "relation" }],
    [{ ...current, schema: "auth_proof_private" }],
  ]) {
    await assert.rejects(
      assertOwnerObjects(client(bad)),
      /owner object inventory is unsafe/,
    );
  }
});
