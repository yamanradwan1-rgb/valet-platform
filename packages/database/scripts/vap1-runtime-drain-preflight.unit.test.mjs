import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { assertVap1RuntimeDrainPreflight } from "./vap1-runtime-drain-preflight.mjs";
import { provisionVap1RestrictedRuntime } from "./vap1-security-cutover-provision.mjs";
import { assertLegacyRuntimeProvisioningAllowed } from "./vap1-security-privileges.mjs";

const role = Object.freeze({
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
});

function result(row) {
  return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
}

function fixture({
  phase = "DRAINED",
  login = false,
  sessions = 0,
  prepared = 0,
  drift = false,
  memberships = 0,
  ownedProtected = 0,
  otherWriters = 0,
  malformedCounts = false,
} = {}) {
  const queries = [];
  const formatted = [];
  const directWrites = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK")
        return result({});
      if (/^\s*REVOKE\b/.test(sql)) {
        directWrites.push(sql);
        return result({});
      }
      if (sql.includes("security_boundary WHERE singleton"))
        return result({ phase });
      if (sql.includes("FROM pg_catalog.pg_roles WHERE rolname=$1")) {
        return result({ ...role, rolcanlogin: login });
      }
      if (
        sql.includes("AS memberships") &&
        sql.includes("AS owned_protected")
      ) {
        return result({ memberships, owned_protected: ownedProtected });
      }
      if (sql.includes("AS count FROM pg_catalog.pg_roles r")) {
        return result({ count: otherWriters });
      }
      if (sql.includes("pg_catalog.pg_prepared_xacts")) {
        return result({
          sessions: malformedCounts ? null : sessions,
          prepared,
        });
      }
      if (sql.includes("pg_catalog.quote_ident(attname)")) {
        return { rowCount: 1, rows: [{ column_sql: "state" }] };
      }
      if (sql.includes("pg_catalog.to_regprocedure($1)")) {
        return result({ function_oid: values[0] });
      }
      if (sql.includes("has_function_privilege") && sql.includes(" AS can")) {
        return result({ can: false });
      }
      if (
        sql.includes(
          "FROM pg_catalog.pg_roles WHERE rolname='vap1_proof_owner'",
        )
      ) {
        return result({ ...role, rolcanlogin: false });
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members"))
        return result({ count: 0 });
      if (
        sql.includes("FROM pg_catalog.pg_proc") ||
        sql.includes("FROM pg_catalog.pg_class") ||
        sql.includes("FROM pg_catalog.pg_proc p")
      ) {
        return result({ count: 0 });
      }
      if (sql.includes("AS usage") && sql.includes("auth_proof_private")) {
        return result({
          usage: false,
          create: false,
          key_read: false,
          challenge_write: false,
          receipt_read: false,
          admission_write: false,
        });
      }
      if (sql.includes(" AS ins,") && sql.includes("has_table_privilege")) {
        return result({
          ins: drift,
          upd: false,
          del: false,
          any_ins: false,
          any_upd: false,
        });
      }
      throw new Error(
        "Unexpected PG mock SQL (not a real DB): " + sql.slice(0, 100),
      );
    },
  };
  const executeFormatted = async (_, sql, values) => {
    formatted.push({ sql, values });
  };
  return { client, executeFormatted, queries, formatted, directWrites };
}

test("C3 preflight is read-only and demands NOLOGIN, no runtime sessions or prepared xacts", async () => {
  const good = fixture();
  assert.deepEqual(
    await assertVap1RuntimeDrainPreflight(good.client, "app_runtime"),
    {
      phase: "DRAINED",
      drain: "ZERO_OBSERVED_AT_PREFLIGHT",
    },
  );
  assert.equal(good.queries.length, 5);
  assert.ok(good.queries[0].sql.includes("FOR SHARE"));
  assert.ok(good.queries[2].sql.includes("pg_catalog.pg_auth_members"));
  assert.ok(good.queries[2].sql.includes("pg_catalog.pg_class"));
  assert.ok(good.queries[3].sql.includes("'state', 'UPDATE'"));
  assert.ok(good.queries[3].sql.includes("'group_key_hash', 'UPDATE'"));
  assert.ok(good.queries[4].sql.includes("pg_catalog.pg_stat_activity"));
  assert.ok(good.queries[4].sql.includes("pg_catalog.pg_prepared_xacts"));
  for (const config of [
    { phase: "LEGACY_COMPAT" },
    { login: true },
    { sessions: 1 },
    { prepared: 1 },
    { memberships: 1 },
    { ownedProtected: 1 },
    { otherWriters: 1 },
    { malformedCounts: true },
    { phase: "PROTECTED", login: false },
  ]) {
    const negative = fixture(config);
    await assert.rejects(
      assertVap1RuntimeDrainPreflight(negative.client, "app_runtime"),
      /VAP1/,
    );
  }
  await assert.rejects(
    assertVap1RuntimeDrainPreflight(good.client, "public;DROP ROLE root"),
    /canonical/,
  );
});

test("unsafe C3 drain rejects before any ACL mutation; attempts rollback", async () => {
  for (const config of [
    { phase: "LEGACY_COMPAT" },
    { login: true },
    { sessions: 3 },
    { prepared: 1 },
    { memberships: 1 },
    { ownedProtected: 1 },
    { otherWriters: 1 },
    { malformedCounts: true },
  ]) {
    const state = fixture(config);
    await assert.rejects(
      provisionVap1RestrictedRuntime(
        state.client,
        state.executeFormatted,
        "app_runtime",
      ),
    );
    assert.equal(state.formatted.length, 0);
    assert.equal(state.directWrites.length, 0);
    assert.equal(state.queries[0].sql, "BEGIN");
    assert.equal(state.queries.at(-1).sql, "ROLLBACK");
    assert.ok(
      !state.queries.some(({ sql }) => /\bREVOKE\b|\bGRANT\b/.test(sql)),
    );
  }
});

test("PROTECTED drift rejects BEFORE repair; clean PROTECTED re-run stays restricted-only", async () => {
  const unsafe = fixture({ phase: "PROTECTED", login: true, drift: true });
  await assert.rejects(
    provisionVap1RestrictedRuntime(
      unsafe.client,
      unsafe.executeFormatted,
      "app_runtime",
    ),
    /protected table writes remain/,
  );
  assert.equal(unsafe.formatted.length, 0);
  assert.equal(unsafe.directWrites.length, 0);
  assert.equal(unsafe.queries.at(-1).sql, "ROLLBACK");

  const clean = fixture({ phase: "PROTECTED", login: true });
  for (let run = 0; run < 2; run++) {
    const outcome = await provisionVap1RestrictedRuntime(
      clean.client,
      clean.executeFormatted,
      "app_runtime",
    );
    assert.equal(outcome.result, "RESTRICTED_ACL_ONLY");
    assert.equal(outcome.proofWritersReady, false);
    assert.equal(outcome.drainAtPreflight, "NOT_APPLICABLE");
  }
  assert.equal(clean.queries.filter(({ sql }) => sql === "COMMIT").length, 2);
  assert.equal(clean.queries.filter(({ sql }) => sql === "ROLLBACK").length, 0);
});

test("DRAINED NOLOGIN cutover repeats without admitting credentials or claiming proof", async () => {
  const state = fixture();
  for (let run = 0; run < 2; run++) {
    const outcome = await provisionVap1RestrictedRuntime(
      state.client,
      state.executeFormatted,
      "app_runtime",
    );
    assert.equal(outcome.phase, "DRAINED");
    assert.equal(outcome.result, "RESTRICTED_ACL_ONLY");
    assert.equal(outcome.proofWritersReady, false);
    assert.equal(outcome.drainAtPreflight, "ZERO_OBSERVED_AT_PREFLIGHT");
  }
  assert.equal(state.queries.filter(({ sql }) => sql === "COMMIT").length, 2);
  assert.equal(
    state.formatted.filter(({ sql }) => sql.includes("REVOKE")).length > 0,
    true,
  );
  assert.equal(
    state.formatted.some(({ sql }) => /\bGRANT\b/.test(sql)),
    false,
  );
});

test("legacy provisioner remains compatible only in LEGACY_COMPAT and fences protected phases", async () => {
  for (const phase of ["LEGACY_COMPAT", "DRAINED", "PROTECTED"]) {
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        if (sql.includes("pg_catalog.pg_namespace"))
          return result({ exists: 1 });
        if (sql.includes("security_boundary WHERE singleton FOR SHARE")) {
          return result({ phase });
        }
        throw new Error("Unreviewed SQL from legacy provisioner guard.");
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
    assert.equal(queries.length, 2);
  }
});

test("old Staff Auth/Guest limiter UPDATE consumers still block a production closure claim", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(
    read("./provision-runtime-role.mjs"),
    /GRANT UPDATE \(state, group_key_hash\) ON TABLE anti_abuse_events TO %I/,
  );
  assert.match(
    read("../../../apps/api/src/modules/anti-abuse/anti-abuse.service.ts"),
    /UPDATE anti_abuse_events\s+SET state = \$1/,
  );
  assert.match(
    read(
      "../../../apps/api/src/modules/anti-abuse/classified-guest-counter.ts",
    ),
    /UPDATE anti_abuse_events SET group_key_hash=\$3/,
  );
  const readiness = read(
    "../../../apps/api/src/common/database/runtime-database-readiness.ts",
  );
  assert.match(readiness, /'state', 'UPDATE'/);
  assert.match(readiness, /'group_key_hash', 'UPDATE'/);
  assert.match(read("./guest-runtime-privileges.mjs"), /AS group_update/);
});
