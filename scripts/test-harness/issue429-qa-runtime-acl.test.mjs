import assert from "node:assert/strict";
import { test } from "node:test";

import {
  observeIssue429RuntimeAcl,
  verifyIssue429AclSnapshot,
} from "./issue429-qa-runtime-acl.mjs";

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
      can_references: false, column_can_select: false,
      column_can_insert: false, column_can_update: false,
      column_can_references: false,
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

test("ACL scanner rejects readable budgets and any effective column grant on all six tables", () => {
  const names = [
    "ocr_platform_control", "ocr_organization_control",
    "ocr_budget_periods", "ocr_organization_allocations",
    "ocr_attempts", "ocr_control_history",
  ];
  for (const name of names) {
    for (const privilege of [
      "can_select", "can_references", "column_can_select",
      "column_can_insert", "column_can_update", "column_can_references",
    ]) {
      const altered = safeSnapshot();
      altered.tablePrivileges.find((row) => row.table === name)[privilege] = true;
      const result = verifyIssue429AclSnapshot(altered);
      assert.equal(result.status, "FAIL", `${name} ${privilege}`);
      assert.ok(result.failures.includes(`${name}:${privilege}`));
    }
  }
});

test("missing effective-column result must not be interpreted as safe", () => {
  const altered = safeSnapshot();
  delete altered.tablePrivileges[0].column_can_update;
  const result = verifyIssue429AclSnapshot(altered);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.includes("ocr_platform_control:column_can_update"));
});

test("live ACL probe SQL checks table plus any-column grants for all six relations", async () => {
  const sqls = [];
  const runtime = {
    query: async () => ({ rows: [{ name: "qa_runtime_role" }] }),
  };
  const admin = {
    query: async (statement, parameters) => {
      sqls.push({ statement, parameters });
      if (statement.includes("to_regclass")) {
        return { rows: [{
          exists: true, can_select: false, can_insert: false,
          can_update: false, can_delete: false, can_truncate: false,
          can_references: false, column_can_select: false,
          column_can_insert: false, column_can_update: false,
          column_can_references: false,
        }] };
      }
      return { rows: [{
        exists: true,
        runtime_execute: !parameters[0].startsWith("public.ocr_detect"),
        security_definer: true,
        settings: ["search_path=pg_catalog, public"],
        public_execute: false,
        grant_option: false,
      }] };
    },
  };
  const snapshot = await observeIssue429RuntimeAcl(runtime, admin);
  assert.equal(verifyIssue429AclSnapshot(snapshot).status, "PASS");
  const tableQueries = sqls.filter((row) => row.statement.includes("to_regclass"));
  assert.equal(tableQueries.length, 6);
  assert.equal(new Set(tableQueries.map((row) => row.parameters[0])).size, 6);
  for (const { statement, parameters } of tableQueries) {
    assert.equal(parameters[1], "qa_runtime_role");
    for (const right of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
      assert.ok(statement.includes(`has_any_column_privilege($2, $1, '${right}')`));
    }
  }
});
