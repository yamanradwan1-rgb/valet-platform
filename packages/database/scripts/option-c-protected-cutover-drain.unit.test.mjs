import assert from "node:assert/strict";
import { test } from "node:test";

import { assertOptionCLegacyWorkersDrained } from "./option-c-protected-cutover-drain.mjs";

function mock({ connected = false, prepared = false } = {}) {
  const queries = [];
  const client = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      assert.deepEqual(values, ["ordinary_runtime"]);
      return {
        rowCount: sql.includes("pg_stat_activity")
          ? Number(connected)
          : Number(prepared),
      };
    },
  };
  return { client, queries };
}

test("cutover refuses existing runtime pools and durable prepared transactions", async () => {
  const clean = mock();
  await assertOptionCLegacyWorkersDrained(clean.client, "ordinary_runtime");
  assert.equal(clean.queries.length, 2);
  assert.match(clean.queries[0].sql, /pg_stat_activity/);
  assert.match(clean.queries[1].sql, /pg_prepared_xacts/);
  await assert.rejects(
    assertOptionCLegacyWorkersDrained(
      mock({ connected: true }).client,
      "ordinary_runtime",
    ),
    /legacy runtime SQL pool/,
  );
  await assert.rejects(
    assertOptionCLegacyWorkersDrained(
      mock({ prepared: true }).client,
      "ordinary_runtime",
    ),
    /prepared transactions/,
  );
});
