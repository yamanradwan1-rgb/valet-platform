import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectEffectivePg17Privileges } from "./pg17-effective-privileges.mjs";
import {
  acquireExclusiveOwnedLease,
  releaseExclusiveOwnedLease,
} from "./pg17-exclusive-lease.mjs";

function fixture({ legacy = true, missing = false, privileges = {} } = {}) {
  const seen = [];
  const client = {
    async query(sql, args = []) {
      seen.push({ sql, args });
      if (sql.includes("FROM pg_catalog.pg_roles WHERE rolname=$1")) {
        return {
          rowCount: 1,
          rows: [
            {
              rolcanlogin: legacy,
              rolinherit: false,
              rolsuper: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolbypassrls: false,
              rolreplication: false,
            },
          ],
        };
      }
      if (sql.includes("AS outward")) {
        return {
          rowCount: 1,
          rows: [
            {
              outward: 0,
              inbound: 0,
              sessions: 0,
              prepared: 0,
            },
          ],
        };
      }
      if (sql.includes("AS state_upd")) {
        return {
          rowCount: 1,
          rows: [
            {
              table_sel: legacy,
              state_upd: legacy,
              group_upd: legacy,
              scope_ins: legacy,
              key_ins: legacy,
              state_ins: legacy,
              group_ins: legacy,
              class_ins: legacy,
              del: false,
              trunc: false,
              cleanup_execute: legacy,
              ...privileges,
            },
          ],
        };
      }
      if (sql.includes("AS table_writes")) {
        return {
          rowCount: 1,
          rows: [
            {
              table_writes: 0,
              column_writes: missing ? null : 0,
            },
          ],
        };
      }
      if (sql.includes("AS login_writers")) {
        return { rowCount: 1, rows: [{ login_writers: legacy ? 1 : 0 }] };
      }
      throw new Error("Unexpected SQL in ACL mock");
    },
  };
  return { client, seen };
}

test("real SQL observer distinguishes legacy Staff Auth/Guest from denied DRAINED SQL", async () => {
  for (const legacy of [true, false]) {
    const state = fixture({ legacy });
    const report = await inspectEffectivePg17Privileges(
      state.client,
      "issue416_w26_c3run_20261114",
    );
    assert.equal(report.legacyStaffAuthSqlAclPresent, legacy);
    assert.equal(report.legacyGuestClassifiedSqlAclPresent, legacy);
    assert.equal(report.legacyRuntimeReadinessSqlAclPresent, legacy);
    assert.equal(report.mountedFunctionalityVerified, false);
    assert.equal(report.trustedWriterVerified, false);
    assert.equal(report.effective.state_upd, legacy);
    assert.equal(report.effective.group_upd, legacy);
    assert.equal(report.publicAcl.table_writes, 0);
    assert.equal(report.membership.outward, 0);
    assert.equal(report.membership.inbound, 0);
    assert.equal(state.seen.length, 5);
    assert.ok(state.seen.every(({ sql }) => sql.trim().startsWith("SELECT")));
    assert.ok(
      state.seen.every(
        ({ args }) =>
          args.length === 0 || args[0] === "issue416_w26_c3run_20261114",
      ),
    );
  }
});

test("adversarial partial grants cannot pass Staff Auth or Guest SQL requirements", async () => {
  const staffRequired = [
    "table_sel",
    "scope_ins",
    "key_ins",
    "state_ins",
    "state_upd",
  ];
  const guestRequired = [
    "table_sel",
    "scope_ins",
    "key_ins",
    "state_ins",
    "class_ins",
    "group_ins",
    "group_upd",
    "state_upd",
  ];
  const readinessRequired = [
    ...new Set([...staffRequired, ...guestRequired, "cleanup_execute"]),
  ];
  for (const missingPrivilege of readinessRequired) {
    const { client } = fixture({ privileges: { [missingPrivilege]: false } });
    const report = await inspectEffectivePg17Privileges(
      client,
      "partial_runtime",
    );
    assert.equal(
      report.legacyStaffAuthSqlAclPresent,
      !staffRequired.includes(missingPrivilege),
      "Staff Auth false positive when " + missingPrivilege + " denied",
    );
    assert.equal(
      report.legacyGuestClassifiedSqlAclPresent,
      !guestRequired.includes(missingPrivilege),
      "Guest false positive when " + missingPrivilege + " denied",
    );
    assert.equal(report.legacyRuntimeReadinessSqlAclPresent, false);
    assert.equal(report.mountedFunctionalityVerified, false);
    assert.equal(report.trustedWriterVerified, false);
  }
});

test("the previously reproduced partial-grant pattern is rejected", async () => {
  const { client } = fixture({
    privileges: {
      table_sel: false,
      scope_ins: false,
      key_ins: false,
    },
  });
  const report = await inspectEffectivePg17Privileges(
    client,
    "partial_runtime",
  );
  assert.equal(report.effective.state_ins, true);
  assert.equal(report.effective.state_upd, true);
  assert.equal(report.effective.group_ins, true);
  assert.equal(report.effective.class_ins, true);
  assert.equal(report.effective.group_upd, true);
  assert.equal(report.legacyStaffAuthSqlAclPresent, false);
  assert.equal(report.legacyGuestClassifiedSqlAclPresent, false);
  assert.equal(report.legacyRuntimeReadinessSqlAclPresent, false);
});

test("NULL catalog privilege cannot be misrepresented as safe", async () => {
  const state = fixture({ missing: true });
  await assert.rejects(
    inspectEffectivePg17Privileges(state.client, "safe_role"),
    /NULL_ACL_OBSERVATION/,
  );
});

test("exclusive advisory lease rejects concurrent clients and prepared transactions", async () => {
  for (const [locked, foreign_sessions, prepared] of [
    [false, 0, 0],
    [true, 1, 0],
    [true, 0, 1],
  ]) {
    const calls = [];
    const client = {
      async query(sql) {
        calls.push(sql);
        return sql.includes("pg_try_advisory_lock")
          ? { rowCount: 1, rows: [{ locked, foreign_sessions, prepared }] }
          : { rowCount: 1, rows: [{ pg_advisory_unlock: true }] };
      },
    };
    await assert.rejects(
      acquireExclusiveOwnedLease(client),
      /EXCLUSIVE_OWNED_LEASE_UNAVAILABLE/,
    );
    assert.equal(
      calls.some((sql) => sql.includes("pg_advisory_unlock")),
      locked,
    );
  }
});

test("exclusive owned lease holds one session and must be released", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      return sql.includes("pg_try_advisory_lock")
        ? {
            rowCount: 1,
            rows: [
              {
                locked: true,
                foreign_sessions: 0,
                prepared: 0,
              },
            ],
          }
        : { rowCount: 1, rows: [{ released: true }] };
    },
  };
  assert.equal(await acquireExclusiveOwnedLease(client), true);
  await assert.doesNotReject(releaseExclusiveOwnedLease(client));
  assert.equal(queries.length, 2);
});
