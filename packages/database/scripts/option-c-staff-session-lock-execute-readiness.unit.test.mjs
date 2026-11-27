import assert from "node:assert/strict";
import { test } from "node:test";

import {
  staffSessionLockFunction,
  staffSessionLockOwner,
} from "./option-c-staff-session-lock-contract.mjs";
import { assertFunctionAcl } from "./option-c-staff-session-lock-verification.mjs";
import { provisionLegacyStaffSessionLock } from "./option-c-staff-session-lock-acl.mjs";

const runtime = "cos_runtime";
const roles = [
  runtime,
  "vaylet_staff_auth_writer",
  "vaylet_mfa_writer",
  "vaylet_management_writer",
];

function client({ runtimeExecute,readerExecute=false }) {
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
        if (readerExecute) {
          rows.push({
            grantee: "vaylet_rating_feedback_reader_owner",
            is_grantable: false,
          });
        }
        return { rowCount: rows.length, rows };
      }
      if (sql.includes("has_function_privilege")) {
        return {
          rowCount: 1,
          rows: [{ allowed:
            (runtimeExecute && values[0] === runtime) ||
            (readerExecute && values[0] === "vaylet_rating_feedback_reader_owner"),
          }],
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

test("feedback nested grant requires explicit validated P5 stage exception",async()=>{
  const active=client({runtimeExecute:true,readerExecute:true});
  await assert.rejects(
    assertFunctionAcl(active,runtime,roles),/EXECUTE inventory is unsafe/);
  await assertFunctionAcl(active,runtime,roles,{
    allowFeedbackReaderExecutor:true,
  });
  await assert.rejects(assertFunctionAcl(
    client({runtimeExecute:true}),runtime,roles,{
      allowFeedbackReaderExecutor:true,
    }),/EXECUTE inventory is unsafe/);
});

test("LEGACY provisioning grants only the verified session lock to Runtime", async () => {
  let runtimeExecute = false;
  let currentRole = "migrator";
  const connection = {
    async query(sql, values) {
      if (sql === `SET LOCAL ROLE ${staffSessionLockOwner}`) {
        currentRole = staffSessionLockOwner;
        return;
      }
      if (sql === "RESET ROLE") {
        currentRole = "migrator";
        return;
      }
      assert.equal(currentRole, "migrator");
      return client({ runtimeExecute }).query(sql, values);
    },
  };
  await provisionLegacyStaffSessionLock(connection, async (target, sql, values) => {
    assert.equal(target, connection);
    assert.equal(currentRole, staffSessionLockOwner);
    assert.equal(sql, `GRANT EXECUTE ON FUNCTION ${staffSessionLockFunction} TO %I`);
    assert.deepEqual(values, [runtime]);
    runtimeExecute = true;
  }, runtime);
  assert.equal(currentRole, "migrator");
  assert.equal(runtimeExecute, true);
});
