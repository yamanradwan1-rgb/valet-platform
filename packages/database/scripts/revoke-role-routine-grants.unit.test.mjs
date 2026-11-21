import assert from "node:assert/strict";
import { test } from "node:test";
import { revokeDirectFunctionGrants } from "./revoke-role-routine-grants.mjs";

test("only revokes the role's direct grants and rechecks the inventory", async () => {
  const calls = [];
  const signature = "public.allowed_worker_scope(uuid)";
  const client = {
    async query(sql, parameters) {
      assert.match(sql, /aclexplode\(routine\.proacl\)/);
      assert.deepEqual(parameters, ["fixture_worker"]);
      return { rows: calls.length === 0 ? [{ signature }] : [] };
    },
  };
  await revokeDirectFunctionGrants(client, async (target, format, parameters) => {
    assert.equal(target, client);
    calls.push({ format, parameters });
  }, "fixture_worker");
  assert.deepEqual(calls, [{ format: "REVOKE ALL ON ROUTINE %s FROM %I", parameters: [signature, "fixture_worker"] }]);
});

test("fails closed when an independently owned grant survives revocation", async () => {
  const client = { async query() { return { rows: [{ signature: "public.other_scope()" }] }; } };
  await assert.rejects(
    revokeDirectFunctionGrants(client, async () => {}, "fixture_worker"),
    /retains unexpected direct function grants/,
  );
});
