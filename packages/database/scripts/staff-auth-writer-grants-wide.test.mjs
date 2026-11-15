import assert from "node:assert/strict";
import { test } from "node:test";

import { applyStaffAuthWriterGrants } from "./staff-auth-writer-grants.mjs";

test("Staff Auth writer revokes all four column privileges on wide tables in bounded batches", async () => {
  const columns = Array.from({ length: 147 }, (_, i) => `column_${i + 1}`);
  const formatted = [];
  const client = {
    async query(sql, params = []) {
      if (sql.includes("has_function_privilege($1,$3,'EXECUTE')")) {
        assert.deepEqual(params, [
          "vaylet_staff_auth_writer",
          "vaylet_runtime",
          "public.s04_staff_activation_success(uuid,text,text,text)",
        ]);
        return { rowCount: 1, rows: [{ writer: true, ordinary_denied: true }] };
      }
      if (sql.includes("array_agg(att.attname::text")) {
        return {
          rows: params[0]
            ? [{ table_name: "staff_auth_sessions", columns }]
            : [{ table_name: "large_table", columns }],
        };
      }
      return { rows: [] };
    },
  };
  const exec = async (_client, format, values) => {
    assert.ok(
      values.length + 1 <= 100,
      "format() cannot take more than 100 arguments",
    );
    formatted.push({ format, values });
  };

  await applyStaffAuthWriterGrants(
    client,
    exec,
    "vaylet_staff_auth_writer",
    "vaylet_runtime",
  );
  assert.equal(
    formatted.some(({ format }) => /REVOKE ALL ON ALL FUNCTIONS/.test(format)),
    false,
    "foreign-owner functions must not require broad migrator ACL authority",
  );
  for (const [tableName, recipient] of [
    ["large_table", "vaylet_staff_auth_writer"],
    ["staff_auth_sessions", "PUBLIC"],
    ["staff_auth_sessions", "vaylet_runtime"],
  ]) {
    const revokes = formatted.filter(
      ({ format, values }) =>
        format.startsWith("REVOKE SELECT (") &&
        values.includes(tableName) &&
        (recipient === "PUBLIC"
          ? format.endsWith("FROM PUBLIC")
          : values.at(-1) === recipient),
    );
    assert.equal(revokes.length, 8);
    for (let privilegeIndex = 0; privilegeIndex < 4; privilegeIndex++) {
      const seen = revokes.flatMap(({ values }) =>
        values.slice(
          privilegeIndex *
            ((values.length - (recipient === "PUBLIC" ? 1 : 2)) / 4),
          (privilegeIndex + 1) *
            ((values.length - (recipient === "PUBLIC" ? 1 : 2)) / 4),
        ),
      );
      assert.deepEqual(seen, columns);
    }
  }
});
