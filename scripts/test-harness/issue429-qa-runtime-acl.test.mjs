import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyIssue429AclSnapshot } from "./issue429-qa-runtime-acl.mjs";

function safeSnapshot() {
  return {
    roleVerified: true,
    tablePrivileges: [
      "ocr_platform_control", "ocr_organization_control",
      "ocr_budget_periods", "ocr_organization_allocations",
      "ocr_attempts", "ocr_control_history",
    ].map((table) => ({
      table, exists: true, can_insert: false, can_update: false,
      can_delete: false, can_truncate: false, can_select: false,
    })),
    functions: ["ocr_admit", "ocr_settle", "ocr_detect_expired"].map(
      (name, index) => ({
        function: name, exists: true, security_definer: true,
        expectedRuntimeExecute: index !== 2,
        runtime_execute: index !== 2,
        public_execute: false, grant_option: false,
        settings: ["search_path=pg_catalog, public"],
      })),
  };
}

test("ACL scanner accepts only exact restricted runtime inventory", () => {
  assert.deepEqual(verifyIssue429AclSnapshot(safeSnapshot()), {
    status: "PASS", failures: [],
  });
});

test("ACL scanner rejects inherited DML and PUBLIC function privileges", () => {
  const unsafe = safeSnapshot();
  unsafe.tablePrivileges[4].can_update = true;
  unsafe.functions[0].public_execute = true;
  const result = verifyIssue429AclSnapshot(unsafe);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.includes("ocr_attempts:can_update"));
  assert.ok(result.failures.includes("ocr_admit:privilege-or-function-policy"));
});

test("ACL scanner rejects missing object or unsafe search_path", () => {
  const unsafe = safeSnapshot();
  unsafe.tablePrivileges.pop();
  unsafe.functions[1].settings = ["search_path=public,pg_catalog"];
  const result = verifyIssue429AclSnapshot(unsafe);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.includes("private-table-inventory-incomplete"));
  assert.ok(result.failures.includes("ocr_settle:privilege-or-function-policy"));
});
