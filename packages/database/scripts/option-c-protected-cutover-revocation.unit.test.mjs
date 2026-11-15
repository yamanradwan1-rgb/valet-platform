import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { assertOptionCRevocationIsMonotonic } from "./option-c-protected-cutover-revocation.mjs";

const verified = {
  tgenabled: "O",
  tgtype: 19,
  tgisinternal: false,
  tgnargs: 0,
  unconditional: true,
  not_constraint: true,
  prosecdef: false,
  trigger_return: true,
  language: "plpgsql",
  owner: "verified_migrator",
  proconfig: ["search_path=pg_catalog, public"],
  body_sha256:
    "7f4daa120f802ae0be236acafc8cc869735ac88f5742871dd92056c6fe253bba",
};

function client(row, bypassAllowed = false) {
  return {
    query: async (sql) => {
      if (sql.includes("has_parameter_privilege")) {
        return { rowCount: 1, rows: [{ allowed: bypassAllowed }] };
      }
      assert.match(sql, /pg_catalog\.pg_trigger/);
      assert.match(sql, /staff_auth_session_revocation_monotonic_trigger/);
      assert.match(sql, /pg_catalog\.sha256/);
      return {
        rowCount: row === undefined ? 0 : 1,
        rows: row === undefined ? [] : [row],
      };
    },
  };
}

test("cutover requires exact enabled, source-pinned S01 revocation trigger", async () => {
  await assertOptionCRevocationIsMonotonic(
    client(verified),
    "ordinary_runtime",
  );
  await assert.rejects(
    assertOptionCRevocationIsMonotonic(
      client(verified, true),
      "ordinary_runtime",
    ),
    /runtime may bypass the immutable revocation trigger/,
  );
  for (const changed of [
    { tgenabled: "D" },
    { tgtype: 17 },
    { tgisinternal: true },
    { unconditional: false },
    { owner: "ordinary_runtime" },
    { body_sha256: "0".repeat(64) },
    { proconfig: null },
  ]) {
    await assert.rejects(
      assertOptionCRevocationIsMonotonic(
        client({ ...verified, ...changed }),
        "ordinary_runtime",
      ),
      /revocation trigger is missing, disabled or changed/,
    );
  }
  await assert.rejects(
    assertOptionCRevocationIsMonotonic(client(undefined), "ordinary_runtime"),
    /revocation trigger is missing, disabled or changed/,
  );
});

test("cutover gates both phases on trigger and full Management writer effective ACL verifier", () => {
  const readiness = readFileSync(
    new URL("./option-c-protected-cutover-readiness.mjs", import.meta.url),
    "utf8",
  );
  const finalAcl = readFileSync(
    new URL("./option-c-protected-cutover-acl.mjs", import.meta.url),
    "utf8",
  );
  for (const source of [readiness, finalAcl]) {
    assert.match(
      source,
      /await assertOptionCRevocationIsMonotonic\(client, runtimeRole\)/,
    );
    assert.match(
      source,
      /await verifyManagementWriterPrivileges\(\s*client,\s*optionCRoles\.managementWriter,\s*runtimeRole,?\s*\)/,
    );
  }
});

test("forward-only revocation migration still matches the pinned catalog source digest", () => {
  const sql = readFileSync(
    new URL(
      "../prisma/migrations/20261115020100_issue416_optionc_s01_revocation_monotonic/migration.sql",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const body = sql.match(
    /RETURNS TRIGGER LANGUAGE plpgsql\s+SET search_path = pg_catalog, public AS \$\$([\s\S]*?)\$\$;/,
  )?.[1];
  assert.equal(typeof body, "string");
  assert.equal(
    createHash("sha256").update(body).digest("hex"),
    "7f4daa120f802ae0be236acafc8cc869735ac88f5742871dd92056c6fe253bba",
  );
});
