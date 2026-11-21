import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const source = readFileSync(
  new URL("./staff-auth-writer-grants.mjs", import.meta.url), "utf8",
);

test("PG17 catalog column names are cast to text[] before node-postgres array parsing", () => {
  // pg's default parser knows text[] but may return name[] as a raw string.
  // revokeColumnGrants chunks wide catalogs before mapping identifier slots.
  assert.match(
    source,
    /array_agg\(att\.attname::text ORDER BY att\.attnum\) AS columns/,
  );
  assert.doesNotMatch(
    source,
    /array_agg\(att\.attname ORDER BY att\.attnum\) AS columns/,
  );
  assert.match(source, /offset \+= 20/);
  assert.match(source, /table\.columns\.slice\(offset, offset \+ 20\)/);
  assert.match(source, /columns\.map\(\(\) => "%I"\)/);
});
