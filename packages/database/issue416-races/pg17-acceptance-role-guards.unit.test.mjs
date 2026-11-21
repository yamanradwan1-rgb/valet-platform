import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ELEVATED_MEMBERSHIP_SQL,
  LOGIN_PRIVILEGES_SQL,
  assertLoginPrivilegeIsolation,
} from "./pg17-acceptance-role-guards.mjs";

const target = Object.freeze({
  owner: "issue416_w38_owner",
  migrator: "issue416_w38_migrator",
  runtime: "issue416_w38_runtime",
  login: "issue416_w38_test",
});
const noPrivileges = (principal) => ({
  principal,
  superuser: false,
  can_create_db: false,
  can_create_role: false,
  can_replicate: false,
  bypass_rls: false,
  private_usage: false,
  private_create: false,
  key_select: false,
  key_column_select: false,
  key_insert: false,
  key_update: false,
  key_delete: false,
  key_maintain: false,
});
const safeLogins = () => [
  { ...noPrivileges(target.owner), superuser: true },
  { ...noPrivileges(target.migrator), can_create_role: true },
  noPrivileges(target.runtime),
  noPrivileges(target.login),
];

test("requires effective privilege evidence for every login and predefined role graph", () => {
  assert.equal(assertLoginPrivilegeIsolation(safeLogins(), [], target), true);
  assert.match(LOGIN_PRIVILEGES_SQL, /WHERE r\.rolcanlogin/);
  assert.match(LOGIN_PRIVILEGES_SQL, /c\.relname='proof_keys'/);
  assert.match(
    LOGIN_PRIVILEGES_SQL,
    /has_table_privilege\(r\.oid,c\.oid,'SELECT'\)/,
  );
  assert.match(
    ELEVATED_MEMBERSHIP_SQL,
    /'pg_read_all_data','pg_write_all_data'/,
  );
  assert.match(ELEVATED_MEMBERSHIP_SQL, /parent\.rolsuper/);
  for (const privilege of [
    "rolcreatedb",
    "rolcreaterole",
    "rolbypassrls",
    "rolreplication",
  ]) {
    assert.match(ELEVATED_MEMBERSHIP_SQL, new RegExp(`parent\\.${privilege}`));
  }
});

test("any untrusted login has effective proof-key read/write or admin privilege denies", () => {
  for (const field of [
    "superuser",
    "can_create_db",
    "can_create_role",
    "can_replicate",
    "bypass_rls",
    "private_usage",
    "private_create",
    "key_select",
    "key_column_select",
    "key_insert",
    "key_update",
    "key_delete",
    "key_maintain",
  ]) {
    const logins = safeLogins();
    logins.push({ ...noPrivileges("unexpected_login"), [field]: true });
    assert.throws(
      () => assertLoginPrivilegeIsolation(logins, [], target),
      /ISOLATION_UNPROVEN/,
      field,
    );
  }
});

test("SET-only pg_read_all_data membership and incomplete observations deny", () => {
  for (const elevated of [
    [
      {
        granted_role: "pg_read_all_data",
        member_role: "observer",
        inherit_option: false,
        set_option: true,
        admin_option: false,
      },
    ],
    [
      {
        granted_role: "pg_write_all_data",
        member_role: "group",
        inherit_option: true,
        set_option: false,
        admin_option: false,
      },
    ],
    [
      {
        granted_role: "custom_nologin_bypassrls",
        member_role: "untrusted_login",
        inherit_option: false,
        set_option: true,
        admin_option: false,
      },
    ],
  ]) {
    assert.throws(
      () => assertLoginPrivilegeIsolation(safeLogins(), elevated, target),
      /ISOLATION_UNPROVEN/,
    );
  }
  for (const logins of [
    [],
    safeLogins().slice(1),
    [...safeLogins(), safeLogins()[2]],
    [...safeLogins(), { ...noPrivileges(target.login), private_usage: true }],
  ]) {
    assert.throws(
      () => assertLoginPrivilegeIsolation(logins, [], target),
      /ISOLATION_UNPROVEN/,
    );
  }
});
