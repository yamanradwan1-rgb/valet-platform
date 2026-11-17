import assert from "node:assert/strict";
import { test } from "node:test";

import {
  staffSessionLockFunction,
  staffSessionLockOwner,
} from "./option-c-staff-session-lock-contract.mjs";
import { assertFunctionAcl } from "./option-c-staff-session-lock-verification.mjs";

const runtime = "cos_runtime";
const roles = [
  runtime,
  "vaylet_staff_auth_writer",
  "vaylet_mfa_writer",
  "vaylet_management_writer",
];

function client({ runtimeExecute }) {
  return {
    async query(sql, values) {
      if (sql.includes("SELECT function.prosecdef")) {
        assert.deepEqual(values, [staffSessionLockFunction]);
        return {
          rowCount: 1,
          rows: [
            {
              prosecdef: true,
              owner: staffSessionLockOwner,
              public_denied: true,
              proconfig: ["search_path=pg_catalog"],
            },
          ],
        };
      }
      if (sql.includes("SELECT COALESCE(grantee.rolname,'PUBLIC')")) {
        const rows = [{ grantee: staffSessionLockOwner, is_grantable: false }];
        if (runtimeExecute) {
          rows.push({ grantee: runtime, is_grantable: false });
        }
        return { rowCount: rows.length, rows };
      }
      if (sql.includes("has_function_privilege")) {
        return {
          rowCount: 1,
          rows: [{ allowed: runtimeExecute && values[0] === runtime }],
        };
      }
      throw new Error("Unexpected SQL: " + sql);
    },
  };
}

test("LEGACY readiness accepts owner-only session lock EXECUTE before retirement", async () => {
  await assertFunctionAcl(client({ runtimeExecute: false }), runtime, roles, {
    requireRuntimeExecute: false,
  });
  await assertFunctionAcl(client({ runtimeExecute: true }), runtime, roles, {
    requireRuntimeExecute: false,
  });
  await assert.rejects(
    assertFunctionAcl(client({ runtimeExecute: false }), runtime, roles),
    /EXECUTE inventory is unsafe/,
  );
});

test("PROTECTED verification requires the narrow Runtime EXECUTE grant", async () => {
  await assertFunctionAcl(client({ runtimeExecute: true }), runtime, roles);
});
