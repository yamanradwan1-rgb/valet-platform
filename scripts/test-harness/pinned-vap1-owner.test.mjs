import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { patchPostgresOwnershipQueries } from "./postgres-ownership-hooks.mjs";

const pinnedSql = readFileSync(
  new URL(
    "../../packages/database/prisma/migrations/20261113011300_issue416_vap1_private_foundation/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function fixture(roleExists) {
  const events = [];
  const statements = [];
  class Client {
    query(text, params) {
      statements.push({ text, params });
      if (text.startsWith("SELECT EXISTS")) {
        return Promise.resolve({ rows: [{ exists: roleExists }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
  }
  class Pool extends Client {}
  patchPostgresOwnershipQueries({
    appendEvent: (event) => events.push(event),
    pg: { Client, Pool },
  });
  return { client: new Client(), events, statements };
}

test("pinned migration113 accepts only an existing shared CI proof owner", async () => {
  const { client, events, statements } = fixture(true);
  await client.query(pinnedSql);
  assert.equal(statements.length, 2);
  assert.deepEqual(statements[0].params, ["vap1_proof_owner"]);
  assert.equal(statements[1].text, pinnedSql);
  assert.deepEqual(events, []); // The CI-owned global role is never test-cleaned.
});

test("pinned migration113 refuses unowned global role creation", async () => {
  const { client, events, statements } = fixture(false);
  await assert.rejects(
    client.query(pinnedSql),
    /pre-attested shared CI proof owner/,
  );
  assert.equal(statements.length, 1);
  assert.deepEqual(events, []);
});

test("only exact pinned migration source qualifies for shared-role handling", async () => {
  const { client, statements } = fixture(true);
  await assert.rejects(
    client.query(pinnedSql + "\n-- altered after pin"),
    /resource already exists/,
  );
  assert.equal(statements.length, 1);
});

test("regular CREATE ROLE still requires unique per-test ownership", async () => {
  const { client, events } = fixture(false);
  await client.query("CREATE ROLE isolated_synthetic NOLOGIN");
  assert.deepEqual(
    events.map(({ type, name }) => [type, name]),
    [
      ["resource-planned", "isolated_synthetic"],
      ["resource-created", "isolated_synthetic"],
    ],
  );
});
