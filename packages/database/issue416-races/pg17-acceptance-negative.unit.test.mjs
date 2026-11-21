import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeAcl,
  safeAcl,
  safeAcls,
  safeDefaults,
  safeFunctions,
  safeOwnerMembership,
  safeRelationRows,
  safeSchema,
  safeSchemas,
} from "./pg17-acceptance-acl-fixtures.mjs";
import {
  ACL_SQL,
  OWNER_MEMBERSHIP_SQL,
  SCHEMA_ACL_SQL,
  FUNCTION_ACL_SQL,
  RELATION_INVENTORY_SQL,
} from "./pg17-acceptance-catalog.mjs";

test("catalog inventories all auth_proof namespaces and rejects unexpected relation kinds", () => {
  assert.match(ACL_SQL, /left\(n\.nspname,11\) = 'auth_proof_'/);
  assert.match(ACL_SQL, /c\.relkind IN \('r','p'\)/);
  assert.match(RELATION_INVENTORY_SQL, /c\.relkind NOT IN \('r','p'\)/);
  assert.match(SCHEMA_ACL_SQL, /left\(n\.nspname,11\) = 'auth_proof_'/);
  for (const kind of ["S", "v", "m", "f", "i", "c", "p"]) {
    const rows = safeAcls();
    rows[0] = { ...rows[0], relation_kind: kind };
    assert.throws(() => assertSafeAcl(rows), /ACL_UNPROVEN/, kind);
  }
  assert.throws(
    () =>
      assertSafeAcl([
        ...safeAcls(),
        {
          ...safeAcl("unexpected_sequence"),
          relation_kind: "S",
        },
      ]),
    /ACL_UNPROVEN/,
  );
  for (const mutation of [
    (rows) => rows.pop(),
    (rows) => {
      rows[0] = { ...rows[0], relation_kind: "c" };
    },
    (rows) => {
      rows[0] = { ...rows[0], parent_table: "unreviewed" };
    },
    (rows) => {
      rows[0] = { ...rows[0], relation_owner: "untrusted" };
    },
    (rows) => {
      rows[0] = { ...rows[0], relation_name: rows[1].relation_name };
    },
  ]) {
    const rows = safeRelationRows();
    mutation(rows);
    assert.throws(
      () =>
        assertSafeAcl(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          rows,
        ),
      /ACL_UNPROVEN/,
    );
  }
});

test("third-party private grants and owner superuser drift deny, not merely runtime/PUBLIC", () => {
  for (const field of ["nonowner_table_allowed", "nonowner_column_allowed"]) {
    const rows = safeAcls();
    rows[0] = { ...rows[0], [field]: true };
    assert.throws(() => assertSafeAcl(rows), /ACL_UNPROVEN/, field);
  }
  for (const field of ["nonowner_execute"]) {
    const functions = safeFunctions();
    functions[0] = { ...functions[0], [field]: true };
    assert.throws(
      () => assertSafeAcl(undefined, functions),
      /ACL_UNPROVEN/,
      field,
    );
  }
  for (const field of ["schema_owner_superuser", "untrusted_schema_usage"]) {
    for (const name of ["auth_proof_private", "auth_proof_crypto"]) {
      const schemas = safeSchemas().map((schema) =>
        schema.schema_name === name ? { ...schema, [field]: true } : schema,
      );
      assert.throws(
        () => assertSafeAcl(undefined, undefined, schemas),
        /ACL_UNPROVEN/,
      );
    }
  }
  const schemas = safeSchemas().map((schema) =>
    schema.schema_name === "auth_proof_crypto"
      ? { ...schema, extension_owner_superuser: true }
      : schema,
  );
  assert.throws(
    () => assertSafeAcl(undefined, undefined, schemas),
    /ACL_UNPROVEN/,
  );
  for (const field of ["global_nonowner_execute", "schema_nonowner_execute"]) {
    const defaults = [{ ...safeDefaults()[0], [field]: true }];
    assert.throws(
      () => assertSafeAcl(undefined, undefined, undefined, defaults),
      /ACL_UNPROVEN/,
    );
  }
  assert.match(ACL_SQL, /AS nonowner_table_allowed/);
  assert.match(ACL_SQL, /AS nonowner_column_allowed/);
  assert.match(SCHEMA_ACL_SQL, /AS untrusted_schema_usage/);
  assert.match(FUNCTION_ACL_SQL, /AS nonowner_execute/);
  assert.match(FUNCTION_ACL_SQL, /p\.prokind AS function_kind/);
  const replacedProcedure = safeFunctions();
  replacedProcedure[0] = { ...replacedProcedure[0], function_kind: "p" };
  assert.throws(
    () => assertSafeAcl(undefined, replacedProcedure),
    /ACL_UNPROVEN/,
  );
});

test("actual pgcrypto namespace and owner are both required", () => {
  const variants = [
    safeSchemas().map((s) => ({ ...s, is_pgcrypto_extension: false })),
    safeSchemas().map((s) =>
      s.schema_name === "auth_proof_crypto"
        ? { ...s, extension_owner: "unapproved_role" }
        : s,
    ),
    [
      ...safeSchemas(),
      { ...safeSchema("public"), is_pgcrypto_extension: true },
    ],
    safeSchemas().map((s) =>
      s.schema_name === "auth_proof_crypto"
        ? { ...s, is_pgcrypto_extension: false, extension_owner: null }
        : s,
    ),
    [...safeSchemas(), safeSchema("auth_proof_unreviewed")],
  ];
  for (const schemas of variants) {
    assert.throws(
      () => assertSafeAcl(undefined, undefined, schemas),
      /ACL_UNPROVEN/,
    );
  }
});

test("non-owner CREATE on either private namespace and unsafe owner memberships deny", () => {
  for (const schemaName of ["auth_proof_private", "auth_proof_crypto"]) {
    const schemas = safeSchemas().map((s) =>
      s.schema_name === schemaName
        ? { ...s, nonowner_create_allowed: true }
        : s,
    );
    assert.throws(
      () => assertSafeAcl(undefined, undefined, schemas),
      /ACL_UNPROVEN/,
    );
  }
  assert.match(OWNER_MEMBERSHIP_SQL, /OR member\.rolname='vap1_proof_owner'/);
  assert.match(OWNER_MEMBERSHIP_SQL, /OR parent\.rolname=\$1::name/);
  assert.match(OWNER_MEMBERSHIP_SQL, /grantor\.rolname AS grantor_role/);
  assert.equal(
    assertSafeAcl(undefined, undefined, undefined, undefined, undefined,
      safeOwnerMembership().reverse()),
    true,
    "two PG17 grantors may be returned in either order",
  );
  for (const memberships of [
    [],
    [safeOwnerMembership()[0]],
    [safeOwnerMembership()[1]],
    [{ ...safeOwnerMembership()[0], set_option: false }],
    [{ ...safeOwnerMembership()[0], inherit_option: true }],
    [{ ...safeOwnerMembership()[0], admin_option: true }],
    [{ ...safeOwnerMembership()[0], member_role: "runtime" }],
    safeOwnerMembership().map((row) => ({
      ...row, grantor_role: "untrusted_owner",
    })),
    safeOwnerMembership().map((row, i) => i === 0 ? {
      ...row, grantor_role: "issue416_w38_owner",
    } : row),
    safeOwnerMembership().map((row, i) => i === 0 ? {
      ...row, set_option: false,
    } : row),
    safeOwnerMembership().map((row, i) => i === 1 ? {
      ...row, admin_option: false,
    } : row),
    safeOwnerMembership().map((row, i) => i === 1 ? {
      ...row, set_option: true,
    } : row),
    safeOwnerMembership().map((row, i) => i === 1 ? {
      ...row, member_role: "issue416_w38_test",
    } : row),
    [
      ...safeOwnerMembership(),
      { ...safeOwnerMembership()[0], member_role: "runtime" },
    ],
    [
      {
        ...safeOwnerMembership()[0],
        granted_role: "runtime",
        member_role: "vap1_proof_owner",
      },
    ],
  ]) {
    assert.throws(
      () =>
        assertSafeAcl(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          memberships,
        ),
      /ACL_UNPROVEN/,
    );
  }
});
