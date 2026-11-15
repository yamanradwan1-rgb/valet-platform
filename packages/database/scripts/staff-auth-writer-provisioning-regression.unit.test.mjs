import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("./staff-auth-writer-grants.mjs", import.meta.url), "utf8",
);

test("PG17 catalog column names are cast to text[] before node-postgres array parsing", () => {
  // pg's default parser knows text[] but may return name[] as a raw string.
  // revokeColumnGrants later maps table.columns to format-safe %I values.
  assert.match(
    source,
    /array_agg\(att\.attname::text ORDER BY att\.attnum\) AS columns/,
  );
  assert.doesNotMatch(
    source,
    /array_agg\(att\.attname ORDER BY att\.attnum\) AS columns/,
  );
  assert.match(source, /table\.columns\.map\(\(\) => "%I"\)/);
});
