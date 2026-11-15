import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeAcl as assertPrivateAcl,
  safeAcl,
  safeAcls,
  safeDefaults,
  safeFunction,
  safeFunctions,
  safeOwnerRole,
  safeSchemas,
} from "./pg17-acceptance-acl-fixtures.mjs";

test("private ACL baseline requires the exact table, function and owner manifests", () => {
  assert.equal(
    assertPrivateAcl(
      safeAcls(),
      safeFunctions(),
      safeSchemas(),
      safeDefaults(),
      safeOwnerRole(),
    ),
    true,
  );
});

test("runtime and PUBLIC table/column privileges fail closed", () => {
  for (const key of [
    "select_allowed",
    "insert_allowed",
    "update_allowed",
    "delete_allowed",
    "truncate_allowed",
    "column_select_allowed",
    "column_insert_allowed",
    "column_update_allowed",
    "public_table_allowed",
    "owner_membership",
    "public_column_allowed",
  ]) {
    const rows = safeAcls();
    const keyIndex = rows.findIndex((row) => row.table_name === "proof_keys");
    rows[keyIndex] = { ...rows[keyIndex], [key]: true };
    assert.throws(
      () =>
        assertPrivateAcl(
          rows,
          safeFunctions(),
          safeSchemas(),
          safeDefaults(),
          safeOwnerRole(),
        ),
      /ACL_UNPROVEN/,
      key,
    );
  }
});

test("both private schemas deny runtime and PUBLIC USAGE/CREATE", () => {
  for (const key of [
    "runtime_usage",
    "runtime_create",
    "public_usage",
    "public_create",
    "owner_membership",
  ]) {
    assert.throws(
      () =>
        assertPrivateAcl(
          safeAcls(),
          safeFunctions(),
          safeSchemas().map((row) =>
            row.schema_name === "auth_proof_private"
              ? { ...row, [key]: true }
              : row,
          ),
          safeDefaults(),
          safeOwnerRole(),
        ),
      /ACL_UNPROVEN/,
      key,
    );
  }
  assert.throws(
    () =>
      assertPrivateAcl(
        safeAcls(),
        safeFunctions(),
        safeSchemas().map((row) =>
          row.schema_name === "auth_proof_crypto"
            ? { ...row, schema_owner: "untrusted_owner" }
            : row,
        ),
        safeDefaults(),
        safeOwnerRole(),
      ),
    /ACL_UNPROVEN/,
  );
});

test("all 61 exact function signatures and private owner ACLs are mandatory", () => {
  for (const key of ["public_execute", "runtime_execute", "owner_membership"]) {
    const functions = safeFunctions();
    functions[0] = { ...functions[0], [key]: true };
    assert.throws(
      () =>
        assertPrivateAcl(
          safeAcls(),
          functions,
          safeSchemas(),
          safeDefaults(),
          safeOwnerRole(),
        ),
      /ACL_UNPROVEN/,
      key,
    );
  }

  const wrongSignature = safeFunctions();
  const executeIndex = wrongSignature.findIndex((row) =>
    row.signature.startsWith("auth_proof_private.a01_execute("),
  );
  wrongSignature[executeIndex] = {
    ...wrongSignature[executeIndex],
    signature: "auth_proof_private.a01_execute(text)",
  };
  const missing = safeFunctions().slice(1);
  const extra = [
    ...safeFunctions(),
    safeFunction("auth_proof_private.unreviewed(text)"),
  ];
  const duplicate = safeFunctions().map((row, index) =>
    index === 1 ? { ...row, signature: safeFunctions()[0].signature } : row,
  );
  for (const functions of [wrongSignature, missing, extra, duplicate]) {
    assert.throws(
      () =>
        assertPrivateAcl(
          safeAcls(),
          functions,
          safeSchemas(),
          safeDefaults(),
          safeOwnerRole(),
        ),
      /ACL_UNPROVEN/,
    );
  }

  const wrongFunctionOwner = safeFunctions();
  wrongFunctionOwner[0] = {
    ...wrongFunctionOwner[0],
    function_owner: "postgres",
  };
  const wrongTableOwner = safeAcls();
  wrongTableOwner[0] = { ...wrongTableOwner[0], table_owner: "postgres" };
  for (const [tables, functions] of [
    [safeAcls(), wrongFunctionOwner],
    [wrongTableOwner, safeFunctions()],
  ]) {
    assert.throws(
      () =>
        assertPrivateAcl(
          tables,
          functions,
          safeSchemas(),
          safeDefaults(),
          safeOwnerRole(),
        ),
      /ACL_UNPROVEN/,
    );
  }
});

test("default function ACL and NOLOGIN NOINHERIT owner role are required", () => {
  assert.throws(
    () =>
      assertPrivateAcl(
        safeAcls(),
        safeFunctions(),
        safeSchemas(),
        [{ ...safeDefaults()[0], global_public_execute: true }],
        safeOwnerRole(),
      ),
    /ACL_UNPROVEN/,
  );
  assert.throws(
    () =>
      assertPrivateAcl(
        safeAcls(),
        safeFunctions(),
        safeSchemas(),
        safeDefaults(),
        [{ ...safeOwnerRole()[0], rolinherit: true }],
      ),
    /ACL_UNPROVEN/,
  );
});

test("missing, extra and duplicate private tables or schema rows fail closed", () => {
  const duplicate = safeAcls();
  duplicate[0] = { ...duplicate[1] };
  for (const [tables, schemas] of [
    [safeAcls().slice(1), safeSchemas()],
    [[...safeAcls(), safeAcl("unreviewed_private_table")], safeSchemas()],
    [duplicate, safeSchemas()],
    [safeAcls(), []],
  ]) {
    assert.throws(
      () =>
        assertPrivateAcl(
          tables,
          safeFunctions(),
          schemas,
          safeDefaults(),
          safeOwnerRole(),
        ),
      /ACL_UNPROVEN/,
    );
  }
});
