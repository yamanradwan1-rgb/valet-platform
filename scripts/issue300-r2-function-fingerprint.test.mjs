import assert from "node:assert/strict";
import { test } from "node:test";
import { readOwnedGuardFunctionHash } from "./issue300-r2-function-fingerprint.mjs";

const fingerprint = "a".repeat(64);

function db(count = 3, hash = fingerprint) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      return { rowCount: 1, rows: [{ count, fingerprint: hash }] };
    },
  };
}

test("signed guard captures three live catalog function definitions", async () => {
  const client = db();
  assert.equal(await readOwnedGuardFunctionHash(client), fingerprint);
  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0], /pg_get_functiondef\(p\.oid\)/);
  assert.match(client.calls[0], /sha256\(convert_to/);
  assert.match(client.calls[0], /pg_get_function_identity_arguments/);
  assert.match(client.calls[0], /ORDER BY p\.proname COLLATE "C"/);
});

test("function fingerprint capture rejects missing or overloaded guards", async () => {
  for (const count of [0, 1, 2, 4]) {
    await assert.rejects(readOwnedGuardFunctionHash(db(count)),
      /Missing or overloaded/);
  }
});

test("function fingerprint capture rejects malformed digest", async () => {
  for (const malformed of ["", null, "xyz", "a".repeat(63)]) {
    await assert.rejects(readOwnedGuardFunctionHash(db(3, malformed)),
      /Invalid guard function fingerprint/);
  }
});
