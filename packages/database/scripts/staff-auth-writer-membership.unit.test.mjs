import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyStaffAuthWriterMembership } from "./staff-auth-writer-membership.mjs";

const writer = "vaylet_staff_auth_writer";
const runtime = "vaylet_runtime";
const migrator = "vaylet_migrator";
const owner = "vaylet_owner";
const permitted = {
  parent: writer,
  member: migrator,
  grantor: migrator,
  inherit_option: false,
  set_option: false,
  admin_option: true,
};

function fake(rows = [permitted], options = {}) {
  return {
    async query(sql, args) {
      if (sql.includes("pg_catalog.pg_database")) {
        return {
          rowCount: 1,
          rows: [{ migration_role: migrator, database_owner: owner }],
        };
      }
      if (sql.includes("pg_catalog.pg_auth_members")) {
        assert.deepEqual(args, [writer]);
        return { rowCount: rows.length, rows };
      }
      assert.match(sql, /pg_catalog\.pg_has_role/);
      assert.deepEqual(args, [runtime, writer, migrator]);
      return {
        rowCount: 1,
        rows: [
          {
            runtime_set: false,
            runtime_inherit: false,
            migrator_set: false,
            migrator_inherit: false,
            writer_set_migrator: false,
            writer_inherit_migrator: false,
            ...options,
          },
        ],
      };
    },
  };
}

test("Staff Auth accepts PostgreSQL 17 ADMIN-only creator edge without SQL SET", async () => {
  await verifyStaffAuthWriterMembership(fake(), writer, runtime);
  await verifyStaffAuthWriterMembership(
    fake([{ ...permitted, grantor: owner }]),
    writer,
    runtime,
  );
  await verifyStaffAuthWriterMembership(
    fake([{ ...permitted, grantor: "postgres", grantor_superuser: true }]),
    writer,
    runtime,
  );
  await verifyStaffAuthWriterMembership(fake([]), writer, runtime);
});

test("Staff Auth refuses inbound/outbound, SET, inherited and foreign ADMIN edges", async () => {
  for (const mutation of [
    { parent: runtime },
    { member: writer },
    { member: runtime },
    { grantor: "unknown_owner" },
    { grantor: "postgres", grantor_superuser: false },
    { inherit_option: true },
    { set_option: true },
    { admin_option: false },
  ]) {
    await assert.rejects(
      verifyStaffAuthWriterMembership(
        fake([{ ...permitted, ...mutation }]),
        writer,
        runtime,
      ),
      /unsafe role membership/,
    );
  }
  await assert.rejects(
    verifyStaffAuthWriterMembership(
      fake([permitted, permitted]),
      writer,
      runtime,
    ),
    /unsafe role membership/,
  );
  for (const privilege of [
    "runtime_set",
    "runtime_inherit",
    "migrator_set",
    "migrator_inherit",
    "writer_set_migrator",
    "writer_inherit_migrator",
  ]) {
    await assert.rejects(
      verifyStaffAuthWriterMembership(
        fake([permitted], { [privilege]: true }),
        writer,
        runtime,
      ),
      /SET or inherited authority/,
    );
  }
});
