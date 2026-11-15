import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { assertAntiAbuseAclRetired } from "./vap1-anti-abuse-closure.mjs";
import { assertLegacyRuntimeProvisioningAllowed } from "./vap1-security-privileges.mjs";

function fakePostAcl({
  present = true,
  table = 0,
  column = 0,
  defaults = 0,
  ordinary = 0,
  invalid = false,
} = {}) {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("AS public_table_writes")) {
        return {
          rowCount: 1,
          rows: [
            {
              present,
              public_table_writes: table,
              public_column_writes: column,
              public_default_writes: defaults,
            },
          ],
        };
      }
      if (sql.includes("AS ordinary_writers")) {
        return invalid
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [{ ordinary_writers: ordinary }] };
      }
      throw new Error("Unrecognized ACL query in mock.");
    },
  };
  return { client, queries };
}

test("negative post-C3 ACL gate rejects missing table, PUBLIC, column, default and ordinary writers", async () => {
  for (const change of [
    { present: false },
    { table: 1 },
    { column: 1 },
    { defaults: 1 },
    { ordinary: 1 },
    { invalid: true },
  ]) {
    const state = fakePostAcl(change);
    await assert.rejects(assertAntiAbuseAclRetired(state.client), /VAP1 C3/);
    assert.ok(state.queries.length >= 1);
    assert.ok(
      state.queries.every((sql) => /^\s*(SELECT|WITH RECURSIVE)\b/.test(sql)),
    );
  }
});

test("static PG17 ACL query examines SET ROLE closure and both global/schema default ACLs", async () => {
  const state = fakePostAcl();
  assert.deepEqual(await assertAntiAbuseAclRetired(state.client), {
    antiAbusePublicAndOrdinaryWrites: "DENIED_BY_QUERIED_ACL",
  });
  assert.equal(state.queries.length, 2);
  assert.match(state.queries[0], /pg_catalog\.aclexplode/);
  assert.match(state.queries[0], /a\.attacl/);
  assert.match(state.queries[0], /pg_catalog\.acldefault\('c',c\.relowner\)/);
  assert.match(state.queries[0], /pg_catalog\.array_length\(a\.attacl,1\)/);
  assert.match(state.queries[0], /pg_catalog\.array_length\(d\.defaclacl,1\)/);
  assert.doesNotMatch(state.queries[0], /ARRAY\[\]::aclitem\[\]/);
  assert.match(state.queries[0], /d\.defaclnamespace=0/);
  assert.match(state.queries[1], /WITH RECURSIVE reachable/);
  assert.match(state.queries[1], /m\.set_option/);
  assert.match(state.queries[1], /m\.admin_option/);
  assert.match(state.queries[1], /has_any_column_privilege/);
  assert.match(state.queries[1], /'public\.anti_abuse_events','UPDATE'/);
});

test("S04 Staff Auth and Guest SQL uses protected finalizers without runtime state/group UPDATE", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("./provision-runtime-role.mjs"), /provisionS04RuntimePrivileges/);
  assert.doesNotMatch(read("./provision-runtime-role.mjs"), /GRANT UPDATE \(state, group_key_hash\)/);
  assert.match(read("./s04-runtime-privileges.mjs"), /REVOKE UPDATE \(state,group_key_hash\)/);
  assert.match(
    read("../../../apps/api/src/modules/anti-abuse/anti-abuse.service.ts"),
    /public.s04_finalize/,
  );
  assert.match(
    read("../prisma/migrations/20261115016200_issue416_s04_signed_quota_guard/migration.sql"),
    /CREATE FUNCTION public.s04_staff_login_success/,
  );
  assert.match(
    read("../../../apps/api/src/modules/anti-abuse/s04-guest-classified-counter.ts"),
    /public.s04_guest_classified/,
  );
  const readiness = read(
    "../../../apps/api/src/common/database/runtime-database-readiness.ts",
  );
  assert.match(readiness, /NOT has_any_column_privilege\(current_user,'public.anti_abuse_events','UPDATE'\)/);
  assert.match(read("./guest-runtime-privileges.mjs"), /verifyS04RuntimePrivileges/);
});

test("LEGACY_COMPAT allows the original role provisioner, protected phases prohibit regrant", async () => {
  for (const phase of ["LEGACY_COMPAT", "DRAINED", "PROTECTED"]) {
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        if (sql.includes("pg_catalog.pg_namespace"))
          return { rowCount: 1, rows: [{}] };
        if (sql === "SET LOCAL ROLE vap1_proof_owner" || sql === "RESET ROLE")
          return { rowCount: 0, rows: [] };
        if (sql.includes("security_boundary WHERE singleton FOR SHARE")) {
          return { rowCount: 1, rows: [{ phase }] };
        }
        throw new Error("Unexpected legacy guard SQL.");
      },
    };
    if (phase === "LEGACY_COMPAT") {
      await assert.doesNotReject(
        assertLegacyRuntimeProvisioningAllowed(client),
      );
    } else {
      await assert.rejects(
        assertLegacyRuntimeProvisioningAllowed(client),
        /VAP1/,
      );
    }
    assert.deepEqual(queries.slice(1, 4), [
      "SET LOCAL ROLE vap1_proof_owner",
      "SELECT phase FROM auth_proof_private.security_boundary WHERE singleton FOR SHARE",
      "RESET ROLE",
    ]);
    assert.equal(queries.length, 4);
  }
});

test("legacy provisioner restores its migrator role even when locked phase read fails", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("pg_catalog.pg_namespace")) return { rowCount: 1, rows: [{}] };
      if (sql === "SET LOCAL ROLE vap1_proof_owner" || sql === "RESET ROLE")
        return { rowCount: 0, rows: [] };
      if (sql.includes("security_boundary WHERE singleton FOR SHARE")) {
        throw new Error("SIMULATED_LOCK_FAILURE");
      }
      throw new Error("UNEXPECTED_QUERY");
    },
  };
  await assert.rejects(
    assertLegacyRuntimeProvisioningAllowed(client),
    /SIMULATED_LOCK_FAILURE/,
  );
  assert.equal(queries.at(-1), "RESET ROLE");
});
