import assert from "node:assert/strict";
import { test } from "node:test";

import {
  lockOptionCBoundary,
  optionCRoles,
  readOptionCCutoverConfiguration,
} from "./option-c-protected-cutover-state.mjs";
import { runOptionCProtectedCutoverTransaction } from "./option-c-protected-cutover-transaction.mjs";

function configuration(overrides = {}) {
  return {
    NODE_ENV: "test",
    OPTION_C_PROTECTED_CUTOVER: "1",
    OPTION_C_LEGACY_WORKERS_DRAINED: "1",
    MIGRATION_DATABASE_URL:
      "postgresql://cutover_migrator:migration-secret@127.0.0.1:45561/cutover_test",
    DATABASE_URL:
      "postgresql://ordinary_runtime:runtime-secret@127.0.0.1:45561/cutover_test",
    STAFF_AUTH_WRITER_DATABASE_URL:
      "postgresql://vaylet_staff_auth_writer:staff-secret@127.0.0.1:45561/cutover_test",
    MFA_WRITER_DATABASE_URL:
      "postgresql://vaylet_mfa_writer:mfa-secret@127.0.0.1:45561/cutover_test",
    MANAGEMENT_WRITER_DATABASE_URL:
      "postgresql://vaylet_management_writer:management-secret@127.0.0.1:45561/cutover_test",
    ...overrides,
  };
}

test("operator cutover input requires explicit opt-in and fixed isolated writer identities", () => {
  const parsed = readOptionCCutoverConfiguration(configuration());
  assert.equal(parsed.migrationIdentity.role, "cutover_migrator");
  assert.equal(parsed.runtimeIdentity.role, "ordinary_runtime");
  assert.deepEqual(
    Object.keys(parsed.writers).sort(),
    [
      optionCRoles.managementWriter,
      optionCRoles.mfaWriter,
      optionCRoles.staffAuthWriter,
    ].sort(),
  );
  assert.throws(
    () =>
      readOptionCCutoverConfiguration(
        configuration({
          OPTION_C_PROTECTED_CUTOVER: "0",
        }),
      ),
    /explicit operator opt-in/,
  );
  assert.throws(
    () =>
      readOptionCCutoverConfiguration(
        configuration({
          OPTION_C_LEGACY_WORKERS_DRAINED: "0",
        }),
      ),
    /legacy worker drain/,
  );
  assert.throws(
    () =>
      readOptionCCutoverConfiguration(
        configuration({
          MFA_WRITER_DATABASE_URL:
            "postgresql://wrong_mfa_writer:mfa-secret@127.0.0.1:45561/cutover_test",
        }),
      ),
    /fixed protected role/,
  );
  assert.throws(
    () =>
      readOptionCCutoverConfiguration(
        configuration({
          MANAGEMENT_WRITER_DATABASE_URL:
            "postgresql://vaylet_management_writer:runtime-secret@127.0.0.1:45561/cutover_test",
        }),
      ),
    /distinct roles and passwords/,
  );
});

function boundaryFixture({ phase = "LEGACY", unsafeMembership = false } = {}) {
  const queries = [];
  const migrationRole = "cutover_migrator";
  const ownerRole = "cutover_owner";
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes("database_owner.rolname")) {
        return { rowCount: 1, rows: [{ database_owner: ownerRole }] };
      }
      if (sql.includes("FROM pg_catalog.pg_roles WHERE rolname=$1")) {
        return {
          rowCount: 1,
          rows: [
            {
              rolcanlogin: false,
              rolinherit: false,
              rolsuper: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolbypassrls: false,
            },
          ],
        };
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members membership")) {
        const direct = {
          granted_role: optionCRoles.proofOwner,
          member_role: migrationRole,
          grantor_role: migrationRole,
          inherit_option: false,
          set_option: true,
          admin_option: false,
        };
        const creator = {
          granted_role: optionCRoles.proofOwner,
          member_role: migrationRole,
          grantor_role: ownerRole,
          inherit_option: false,
          set_option: false,
          admin_option: true,
        };
        return {
          rowCount: 2,
          rows: unsafeMembership
            ? [direct, { ...creator, set_option: true }]
            : [direct, creator],
        };
      }
      if (
        sql === `SET LOCAL ROLE ${optionCRoles.proofOwner}` ||
        sql === "RESET ROLE"
      ) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("WHERE singleton FOR UPDATE")) {
        return {
          rowCount: 1,
          rows: [{ phase, backend_pid: 77, full_xid: "9001" }],
        };
      }
      if (sql.includes("SELECT current_user,session_user")) {
        return {
          rowCount: 1,
          rows: [
            {
              current_user: migrationRole,
              session_user: migrationRole,
              backend_pid: 77,
              full_xid: "9001",
            },
          ],
        };
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    },
  };
  return { client, migrationRole, queries };
}

test("boundary lock uses exact SET-only owner membership and immediately restores migrator", async () => {
  const { client, migrationRole, queries } = boundaryFixture();
  const state = await lockOptionCBoundary(client, migrationRole);
  assert.equal(state.phase, "LEGACY");
  const setIndex = queries.findIndex(({ sql }) =>
    sql.startsWith("SET LOCAL ROLE"),
  );
  const lockIndex = queries.findIndex(({ sql }) =>
    sql.includes("WHERE singleton FOR UPDATE"),
  );
  const resetIndex = queries.findIndex(({ sql }) => sql === "RESET ROLE");
  const identityIndex = queries.findIndex(({ sql }) =>
    sql.includes("SELECT current_user,session_user"),
  );
  assert(setIndex >= 0 && setIndex < lockIndex);
  assert.equal(resetIndex, lockIndex + 1);
  assert(identityIndex > resetIndex);
  const unsafe = boundaryFixture({ unsafeMembership: true });
  await assert.rejects(
    lockOptionCBoundary(unsafe.client, unsafe.migrationRole),
    /SET-only membership is unsafe/,
  );
  const unsafeLock = unsafe.queries.findIndex(({ sql }) =>
    sql.includes("WHERE singleton FOR UPDATE"),
  );
  const unsafeReset = unsafe.queries.findIndex(
    ({ sql }) => sql === "RESET ROLE",
  );
  const unsafeMembership = unsafe.queries.findIndex(({ sql }) =>
    sql.includes("FROM pg_catalog.pg_auth_members membership"),
  );
  assert(unsafeLock >= 0 && unsafeReset === unsafeLock + 1);
  assert(unsafeMembership > unsafeReset);
});

function transactionFixture(phase = "LEGACY", failFinal = false) {
  const events = [];
  const state = { phase, backend_pid: 88, full_xid: "9002" };
  const client = {
    query: async (sql) => {
      events.push(sql);
      return { rowCount: 0, rows: [] };
    },
  };
  const deps = {
    lockBoundary: async () => {
      events.push("LOCK_BOUNDARY");
      return state;
    },
    assertLegacyDrained: async () => events.push("ASSERT_LEGACY_DRAINED"),
    verifyReadiness: async (_client, _runtimeRole, _migrationRole, options) => {
      assert.equal(options?.phase, phase);
      events.push("VERIFY_READINESS");
    },
    retireLegacyAcl: async () => events.push("RETIRE_LEGACY_ACL"),
    verifyFinalAcl: async () => {
      events.push("VERIFY_FINAL_ACL");
      if (failFinal) throw new Error("FINAL_ACL_UNSAFE");
    },
    assertSameTransaction: async () => events.push("ASSERT_SAME_XID"),
    promoteBoundary: async () => {
      events.push("PROMOTE_PROTECTED");
      return true;
    },
  };
  return { client, deps, events };
}

test("LEGACY cutover serializes lock, readiness, exact retirement, verification and promotion", async () => {
  const { client, deps, events } = transactionFixture();
  const result = await runOptionCProtectedCutoverTransaction(
    client,
    { migrationRole: "migrator", runtimeRole: "runtime" },
    async () => {},
    deps,
  );
  assert.deepEqual(result, { phaseBefore: "LEGACY", promoted: true });
  assert.deepEqual(events, [
    "BEGIN",
    "LOCK_BOUNDARY",
    "ASSERT_LEGACY_DRAINED",
    "VERIFY_READINESS",
    "RETIRE_LEGACY_ACL",
    "VERIFY_FINAL_ACL",
    "ASSERT_SAME_XID",
    "PROMOTE_PROTECTED",
    "ASSERT_SAME_XID",
    "COMMIT",
  ]);
});

test("PROTECTED rerun is verification-only and any failed final ACL rolls back", async () => {
  const protectedFixture = transactionFixture("PROTECTED");
  const result = await runOptionCProtectedCutoverTransaction(
    protectedFixture.client,
    { migrationRole: "migrator", runtimeRole: "runtime" },
    async () => {},
    protectedFixture.deps,
  );
  assert.deepEqual(result, { phaseBefore: "PROTECTED", promoted: false });
  assert(!protectedFixture.events.includes("RETIRE_LEGACY_ACL"));
  assert(!protectedFixture.events.includes("PROMOTE_PROTECTED"));

  const failed = transactionFixture("LEGACY", true);
  await assert.rejects(
    runOptionCProtectedCutoverTransaction(
      failed.client,
      { migrationRole: "migrator", runtimeRole: "runtime" },
      async () => {},
      failed.deps,
    ),
    /FINAL_ACL_UNSAFE/,
  );
  assert.equal(failed.events.at(-1), "ROLLBACK");
  assert(!failed.events.includes("PROMOTE_PROTECTED"));
});
