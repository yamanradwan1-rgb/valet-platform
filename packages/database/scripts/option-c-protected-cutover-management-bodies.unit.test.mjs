import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  pinnedOptionCManagementBodies,
  verifyOptionCManagementBodies,
} from "./option-c-protected-cutover-management-bodies.mjs";

const sql = readFileSync(new URL(
  "../prisma/migrations/20261115190000_option_c_management_writer/migration.sql",
  import.meta.url,
), "utf8").replace(/\r\n/g, "\n");

test("S03 installed-function SHA pins match the reviewed raw-token SQL source", () => {
  assert.equal(pinnedOptionCManagementBodies.length, 7);
  for (const [signature, digest] of pinnedOptionCManagementBodies) {
    const name = signature.slice("public.".length, signature.indexOf("("));
    const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
    assert.ok(start >= 0, name);
    const bodyStart = sql.indexOf("AS $$", start) + 5;
    const bodyEnd = sql.indexOf("$$;", bodyStart);
    assert.ok(bodyStart >= start + 5 && bodyEnd > bodyStart);
    const body = sql.slice(bodyStart, bodyEnd);
    assert.match(body, /p_access_token/);
    assert.doesNotMatch(body, /p_access_hash/);
    assert.equal(createHash("sha256").update(body).digest("hex"), digest, name);
  }
});

test("S03 cutover rejects old installed SQL even when migration was marked applied", async () => {
  const good = new Map(pinnedOptionCManagementBodies);
  const client = {
    async query(statement, [signature]) {
      assert.match(statement, /pg_catalog\.sha256/);
      assert.match(statement, /pg_catalog\.replace\(function\.prosrc/);
      return { rowCount: 1, rows: [{ body_sha256: good.get(signature) }] };
    },
  };
  await verifyOptionCManagementBodies(client);
  const first = pinnedOptionCManagementBodies[0][0];
  good.set(first, "0".repeat(64));
  await assert.rejects(verifyOptionCManagementBodies(client), /installed function differs/);
});

test("both LEGACY promotion and PROTECTED rerun verify exact S03 SQL bodies", () => {
  for (const filename of [
    "option-c-protected-cutover-readiness.mjs",
    "option-c-protected-cutover-acl.mjs",
  ]) {
    const source = readFileSync(new URL(filename, import.meta.url), "utf8");
    assert.match(source, /await verifyOptionCManagementBodies\(client\)/);
  }
});
