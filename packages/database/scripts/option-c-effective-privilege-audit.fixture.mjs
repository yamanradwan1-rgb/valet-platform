import assert from "node:assert/strict";
import { catalogQueries } from "./option-c-effective-privilege-catalog.mjs";
import { optionCFunctionContract } from "./option-c-protected-cutover-acl.mjs";
import { protectedTables } from "./option-c-effective-privilege-policy.mjs";
import { staffSessionLockOwnerColumns } from "./option-c-staff-session-lock-contract.mjs";
export const roles = {
  runtime: "runtime",
  staffAuthWriter: "auth_writer",
  mfaWriter: "mfa_writer",
  managementWriter: "management_writer",
  migrationRole: "migrator",
};
export const names = {
  ...roles,
  sessionLockOwner: "vaylet_staff_session_lock_owner",
};
const roleRows = Object.values(names).map((role) => ({
  role,
  login: role !== names.sessionLockOwner,
  superuser: false,
  create_database: false,
  create_role: false,
  replication: false,
  bypass_rls: false,
  database_owner: "db_owner",
}));
const column = (role, object, name, privilege, effective) => ({
  kind: "column",
  role,
  object,
  column: name,
  privilege,
  effective,
  grant_option: false,
  grants: [],
});
const table = (role, object, privilege, effective = false) => ({
  kind: "table",
  role,
  object,
  privilege,
  effective,
  grant_option: false,
  grants: [],
});

export function matrix() {
  const rows = roleRows.map((row) => ({ kind: "role", ...row }));
  for (const [type, signatures] of Object.entries({
    staffAuthWriter: optionCFunctionContract.staffAuth,
    mfaWriter: optionCFunctionContract.mfa,
    managementWriter: optionCFunctionContract.management,
    runtime: [
      optionCFunctionContract.mfaActivity,
      optionCFunctionContract.runtimeSessionLock,
    ],
  })) {
    for (const [index, signature] of signatures.entries()) {
      const search_path =
        type === "managementWriter" ||
        (type === "staffAuthWriter" && index === 0)
          ? "pg_catalog, public"
          : "pg_catalog";
      const owner =
        signature === optionCFunctionContract.runtimeSessionLock
          ? names.sessionLockOwner
          : names.migrationRole;
      for (const role of Object.values(names)) {
        const sessionLockOwner =
          signature === optionCFunctionContract.runtimeSessionLock &&
          role === names.sessionLockOwner;
        rows.push({
          kind: "function",
          role,
          object: signature,
          privilege: "EXECUTE",
          effective: role === names[type] || sessionLockOwner,
          grant_option: sessionLockOwner,
          owner,
          security_definer: true,
          proconfig: [`search_path=${search_path}`],
          search_path,
          grants:
            signature === optionCFunctionContract.runtimeSessionLock
              ? [
                  { grantee: names[type], grantOption: false },
                  { grantee: names.sessionLockOwner, grantOption: false },
                ]
              : [{ grantee: names[type], grantOption: false }],
        });
      }
    }
  }
  for (const [object, columns] of Object.entries({
    staff_auth_sessions: [
      "id",
      "user_id",
      "created_at",
      "revoked_at",
      "access_expires_at",
      "absolute_expires_at",
      "runtime_lock_version",
      "current_access_token_hash",
      "last_admin_activity_at",
      "mfa_authenticated_at",
      "mfa_factor_id",
      "last_rotated_at",
    ],
    users: [
      "id",
      "status",
      "password_hash",
      "last_login_at",
      "runtime_lock_version",
    ],
  })) {
    for (const role of Object.values(names)) {
      for (const name of columns) {
        for (const privilege of ["SELECT", "UPDATE"]) {
          rows.push(
            column(
              role,
              object,
              name,
              privilege,
              (role === names.sessionLockOwner &&
                (
                  staffSessionLockOwnerColumns[object]?.[privilege] || []
                ).includes(name)) ||
                (role === names.runtime &&
                  privilege === "UPDATE" &&
                  object === "users" &&
                  name === "last_login_at"),
            ),
          );
        }
      }
    }
  }
  for (const role of Object.values(names)) {
    for (const object of protectedTables) {
      for (const privilege of [
        "SELECT",
        "UPDATE",
        "INSERT",
        "DELETE",
        "TRUNCATE",
      ]) {
        rows.push(table(role, object, privilege));
      }
    }
  }
  rows.push({
    kind: "membership",
    role: names.migrationRole,
    object: names.sessionLockOwner,
    member: true,
    direct_set: true,
    direct_inherit: false,
    direct_admin: false,
    effective_set: true,
    effective_inherit: false,
    grantor: names.migrationRole,
  });
  return rows;
}

export function fixtureClient(evidence = matrix()) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      const key = Object.entries(catalogQueries).find(
        ([, query]) => query === sql,
      )?.[0];
      assert(key, "Must execute a real catalog query");
      return {
        rows: evidence.filter(
          (row) =>
            ({
              roles: "role",
              memberships: "membership",
              schemas: "schema",
              tables: "table",
              columns: "column",
              sequences: "sequence",
              functions: "function",
              defaults: "default",
            })[key] === row.kind,
        ),
      };
    },
  };
  return { client, calls };
}
